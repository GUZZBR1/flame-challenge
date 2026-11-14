#include "chamber.hpp"

#include <algorithm>
#include <cstdio>
#include <cstring>

namespace ff {

namespace {
// closed-chamber gas balance — reduced-order constants
constexpr double AIR_DENSITY_KG_M3 = 1.204;   // 1 atm, ~20 °C
constexpr double FUEL_DENSITY_KG_M3 = 700.0;  // generic hydrocarbon
constexpr double STOICH_O2_PER_FUEL = 3.0;    // kg O₂ per kg fuel
constexpr double SPREAD_MASS_KG_PER_CM = 1e-4; // thin sheet, kg per cm of front
// suppressant diluent penalties on effective O₂ (CO₂ heat-sink > He)
constexpr double CO2_SUPPRESS = 1.6;
constexpr double HE_SUPPRESS = 0.8;
} // namespace

Chamber::Chamber() = default;
Chamber::Chamber(MaterialRisk risks) : risks_(std::move(risks)) {}

void Chamber::configure(const Config& cfg) {
    cfg_ = cfg;
    useDroplet_ = cfg.model == "droplet";
    const Material* m = risks_.get(cfg.materialId);
    const Material fallback{"pmma", "PMMA", 15.0, 0.3, 3.5, 0.35, false, false};
    const Material& mat = m ? *m : fallback;

    if (useDroplet_) {
        DropletFlame::Config c;
        c.dropletD0Mm = cfg.dropletD0Mm;
        c.o2Pct = cfg.o2Pct;
        c.pressureKpa = cfg.pressureKpa;
        c.material = mat;
        c.seed = cfg.seed;
        droplet_.configure(c);
    } else {
        SolidSpread::Config c;
        c.slabLengthCm = cfg.slabLengthCm;
        c.o2Pct = cfg.o2Pct;
        c.flowCms = cfg.flowCms;
        c.pressureKpa = cfg.pressureKpa;
        c.partialGravity = cfg.partialGravity;
        c.material = mat;
        spread_.configure(c);
    }
    ignited_ = false;
    lastRegime_ = -1;
    events_.clear();
    chamberO2Pct_ = cfg_.o2Pct;
    o2BelowLoc_ = false;
    pushAtmosphere();
}

void Chamber::updateAtmosphere(double o2Pct, double flowCms, double pressureKpa) {
    // clamp here so the public state (ignitionPressure, config()) never
    // reports unphysical values; the sub-models clamp independently
    cfg_.o2Pct = std::clamp(o2Pct, 0.0, 100.0);
    cfg_.flowCms = std::max(0.0, flowCms);
    cfg_.pressureKpa = std::max(0.0, pressureKpa);
    // a manual atmosphere update is a gas flush — the measured chamber
    // O₂ snaps to the supplied value
    chamberO2Pct_ = cfg_.o2Pct;
    o2BelowLoc_ = false;
    pushAtmosphere();
}

void Chamber::setSuppressants(double co2Pct, double hePct) {
    cfg_.co2Pct = std::clamp(co2Pct, 0.0, 100.0);
    cfg_.hePct = std::clamp(hePct, 0.0, 100.0);
    pushAtmosphere();
}

double Chamber::effectiveO2Pct() const {
    return std::clamp(chamberO2Pct_ - CO2_SUPPRESS * cfg_.co2Pct
                                   - HE_SUPPRESS * cfg_.hePct,
                      0.0, 100.0);
}

void Chamber::pushAtmosphere() {
    const double o2Eff = effectiveO2Pct();
    droplet_.updateAtmosphere(o2Eff, cfg_.pressureKpa);
    spread_.updateAtmosphere(o2Eff, cfg_.flowCms, cfg_.pressureKpa);
}

double Chamber::fuelRateKgS() const {
    if (useDroplet_) {
        const auto& s = droplet_.state();
        const double K = droplet_.burnRateK(); // mm²/s
        // d²-law mass rate: m = ρπ/6·d³ → ṁ = ρπKd/4 (SI: d,K in m,m²/s)
        double kgm = FUEL_DENSITY_KG_M3 * 3.14159265358979323846 * K
                     * s.dropletDMm / 4.0e9;
        if (s.regime == DropletFlame::Regime::CoolFlame) kgm *= 0.05;
        if (s.regime != DropletFlame::Regime::HotFlame &&
            s.regime != DropletFlame::Regime::CoolFlame)
            return 0.0;
        return kgm;
    }
    const auto& s = spread_.state();
    if (s.regime != SolidSpread::Regime::Spreading) return 0.0;
    return s.spreadRateCms * SPREAD_MASS_KG_PER_CM;
}

void Chamber::stepAtmosphere(double dtSec) {
    if (cfg_.volumeLiters <= 0.0) return;
    const double airMassKg = cfg_.volumeLiters / 1000.0 * AIR_DENSITY_KG_M3
                             * std::max(0.0, cfg_.pressureKpa) / 101.0;
    if (airMassKg <= 0.0) return;
    const double ambient = cfg_.ambientO2Pct >= 0.0 ? cfg_.ambientO2Pct
                                                    : cfg_.o2Pct;
    double frac = chamberO2Pct_ / 100.0;
    frac -= STOICH_O2_PER_FUEL * fuelRateKgS() * dtSec / airMassKg;
    frac += cfg_.ventPerSec * (ambient / 100.0 - frac) * dtSec;
    chamberO2Pct_ = std::clamp(frac * 100.0, 0.0, 100.0);
    pushAtmosphere();
    const Material* m = risks_.get(cfg_.materialId);
    if (!o2BelowLoc_ && m && effectiveO2Pct() < m->locPct) {
        o2BelowLoc_ = true;
        events_.push_back("o2-below-loc");
    }
}

double Chamber::ignitionPressure() const {
    const Material* m = risks_.get(cfg_.materialId);
    if (!m) return 0.5;
    return MaterialRisk::ignitionPressure(*m, effectiveO2Pct());
}

void Chamber::step(double dtSec) {
    if (useDroplet_) {
        droplet_.step(dtSec);
        const auto r = droplet_.state().regime;
        if (r == DropletFlame::Regime::HotFlame && !ignited_) {
            ignited_ = true;
            events_.push_back("ignited");
        } else if (r == DropletFlame::Regime::HotFlame &&
                   lastRegime_ == (int)DropletFlame::Regime::CoolFlame) {
            events_.push_back("reignited");
        }
        if (r == DropletFlame::Regime::CoolFlame && lastRegime_ != (int)r)
            events_.push_back("cool-flame-onset");
        if (r == DropletFlame::Regime::Extinguished && lastRegime_ != (int)r)
            events_.push_back("extinguished");
        lastRegime_ = (int)r;
    } else {
        spread_.step(dtSec);
        const auto r = spread_.state().regime;
        if (r == SolidSpread::Regime::Spreading && !ignited_) {
            ignited_ = true;
            events_.push_back("ignited");
        }
        if (r == SolidSpread::Regime::Out && lastRegime_ != (int)r)
            events_.push_back("extinguished");
        lastRegime_ = (int)r;
    }
    stepAtmosphere(dtSec);
}

int Chamber::regime() const {
    return useDroplet_ ? (int)droplet_.state().regime : (int)spread_.state().regime;
}

bool Chamber::hotBurning() const {
    return useDroplet_ ? droplet_.state().regime == DropletFlame::Regime::HotFlame
                       : spread_.state().regime == SolidSpread::Regime::Spreading;
}

bool Chamber::coolFlame() const {
    return useDroplet_ && droplet_.state().regime == DropletFlame::Regime::CoolFlame;
}

bool Chamber::finished() const {
    return useDroplet_ ? droplet_.state().regime == DropletFlame::Regime::Extinguished
                       : spread_.state().regime == SolidSpread::Regime::Out;
}

std::vector<std::string> Chamber::drainEvents() {
    auto out = std::move(events_);
    events_.clear();
    return out;
}

std::string Chamber::stateJson() const {
    // buffer doubles until the payload fits — no fixed-size ceiling to
    // outgrow when fields are added
    auto emit = [&](const char* fmt, auto... args) {
        std::string out;
        for (size_t cap = 512; cap <= (1u << 20); cap *= 2) {
            out.assign(cap, '\0');
            const int n = std::snprintf(out.data(), cap, fmt, args...);
            if (n >= 0 && static_cast<size_t>(n) < cap) {
                out.resize(static_cast<size_t>(n));
                return out;
            }
            if (n < 0) return std::string("{}");  // encoding failure — no hang
        }
        // payload still does not fit at the cap — a buffer of truncated
        // snprintf output + trailing NULs is not JSON; return a valid
        // minimal object instead
        return std::string("{\"error\":\"state too large\"}");
    };
    if (useDroplet_) {
        const auto& s = droplet_.state();
        return emit(
            "{\"model\":\"droplet\",\"tSec\":%.3f,\"regime\":%d,"
            "\"dropletDMm\":%.3f,\"flameRMm\":%.3f,\"flameTempK\":%.1f,"
            "\"heatReleaseW\":%.2f,\"burnFraction\":%.3f,"
            "\"o2Pct\":%.2f,\"o2EffPct\":%.2f,\"volumeLiters\":%.1f,"
            "\"ignited\":%s,\"coolFlame\":%s,\"finished\":%s}",
            s.tSec, (int)s.regime, s.dropletDMm, s.flameRMm, s.flameTempK,
            s.heatReleaseW, s.burnFraction,
            chamberO2Pct_, effectiveO2Pct(), cfg_.volumeLiters,
            ignited_ ? "true" : "false", coolFlame() ? "true" : "false",
            finished() ? "true" : "false");
    }
    const auto& s = spread_.state();
    return emit(
        "{\"model\":\"spread\",\"tSec\":%.3f,\"regime\":%d,"
        "\"frontPosCm\":%.3f,\"spreadRateCms\":%.3f,\"burnLengthCm\":%.3f,"
        "\"intensity\":%.3f,"
        "\"o2Pct\":%.2f,\"o2EffPct\":%.2f,\"volumeLiters\":%.1f,"
        "\"ignited\":%s,\"coolFlame\":false,\"finished\":%s}",
        s.tSec, (int)s.regime, s.frontPosCm, s.spreadRateCms,
        s.burnLengthCm, s.intensity,
        chamberO2Pct_, effectiveO2Pct(), cfg_.volumeLiters,
        ignited_ ? "true" : "false", finished() ? "true" : "false");
}

} // namespace ff
