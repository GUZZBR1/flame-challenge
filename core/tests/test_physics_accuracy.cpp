// Sanity tests validating reduced-order models against published
// microgravity-combustion behavior (FLEX d²-law, SoFIE extinction
// regimes, LOC thresholds).
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "airflow_propagator.hpp"
#include "chamber.hpp"
#include "combustion_solver.hpp"
#include "material_risk.hpp"

using namespace ff;

static int failures = 0;
#define CHECK(cond, msg)                                            \
    do {                                                            \
        if (!(cond)) {                                              \
            std::printf("FAIL: %s (%s:%d)\n", msg, __FILE__, __LINE__); \
            ++failures;                                             \
        }                                                           \
    } while (0)

static bool hasEvent(const std::vector<std::string>& v, const char* s) {
    return std::find(v.begin(), v.end(), s) != v.end();
}

int main() {
    MaterialRisk risks;

    // --- d²-law: droplet d² must shrink ~linearly while hot-burning,
    //     and burnFraction must track consumed *mass* (∝ d³) ---
    {
        DropletFlame flame;
        DropletFlame::Config c;
        c.material = *risks.get("heptane");
        c.o2Pct = 21.0;
        c.dropletD0Mm = 1.0;
        c.seed = 7;
        flame.configure(c);

        const double dt = 0.01;
        const double K = flame.burnRateK();
        CHECK(K > 0.4 && K < 1.5,
              "heptane burn rate at 21% O2 must sit in the PSI range");

        double prevD2 = -1;
        int hotSteps = 0;
        bool d2Linear = true, fracOk = true;
        for (int i = 0; i < 2000 &&
             flame.state().regime != DropletFlame::Regime::Extinguished; ++i) {
            flame.step(dt);
            const auto& s = flame.state();
            if (s.regime != DropletFlame::Regime::HotFlame) continue;
            ++hotSteps;
            if (prevD2 >= 0 && s.dropletDMm > 0.02 &&
                std::fabs(s.dropletDMm * s.dropletDMm - (prevD2 - K * dt)) > 1e-9)
                d2Linear = false;
            const double expectFrac =
                1.0 - std::pow(s.dropletDMm / c.dropletD0Mm, 3.0);
            if (std::fabs(s.burnFraction - expectFrac) > 1e-3) fracOk = false;
            prevD2 = s.dropletDMm * s.dropletDMm;
        }
        CHECK(hotSteps > 50, "droplet must sustain hot burning at 21% O2");
        CHECK(d2Linear, "droplet d^2 must decrease by K*dt each step");
        CHECK(fracOk, "burnFraction must equal 1-(d/d0)^3 during hot burn");
        CHECK(flame.state().regime == DropletFlame::Regime::Extinguished,
              "droplet must extinguish once fuel is exhausted");
        CHECK(flame.state().burnFraction > 0.999,
              "burnFraction must reach ~1.0 at fuel exhaustion");
    }

    // --- degenerate droplet: non-positive initial diameter ---
    {
        DropletFlame flame;
        DropletFlame::Config c;
        c.material = *risks.get("heptane");
        c.o2Pct = 21.0;
        c.dropletD0Mm = 0.0;
        flame.configure(c);
        for (int i = 0; i < 200 &&
             flame.state().regime != DropletFlame::Regime::Extinguished; ++i)
            flame.step(0.01);
        CHECK(flame.state().regime == DropletFlame::Regime::Extinguished,
              "zero-fuel droplet must extinguish immediately");
        CHECK(flame.state().burnFraction >= 0.0 &&
              flame.state().burnFraction <= 1.0,
              "burnFraction must stay inside [0,1] for a degenerate droplet");
    }

    // --- cool flame: actually observed, then ends on fuel exhaustion
    //     long before the 8–14 s fade timer can fire ---
    {
        DropletFlame flame;
        DropletFlame::Config c;
        c.material = *risks.get("heptane"); // coolFlameCapable
        c.o2Pct = 10.5;                     // under the LOC edge
        c.dropletD0Mm = 0.3;                // ~3.8 s of cool-flame fuel
        c.seed = 3;
        flame.configure(c);

        const double dt = 0.01;
        bool sawCool = false, fracOk = true;
        int coolSteps = 0;
        for (int i = 0; i < 5000 &&
             flame.state().regime != DropletFlame::Regime::Extinguished; ++i) {
            flame.step(dt);
            const auto& s = flame.state();
            if (s.regime != DropletFlame::Regime::CoolFlame) continue;
            sawCool = true;
            ++coolSteps;
            const double expectFrac =
                1.0 - std::pow(s.dropletDMm / c.dropletD0Mm, 3.0);
            if (std::fabs(s.burnFraction - expectFrac) > 1e-3) fracOk = false;
        }
        CHECK(sawCool, "heptane at 10.5% O2 must enter cool burning");
        CHECK(fracOk, "burnFraction must track 1-(d/d0)^3 in cool flame");
        CHECK(coolSteps > 0 && coolSteps < 800,
              "cool flame must end on fuel exhaustion, not the fade timer");
        CHECK(flame.state().regime == DropletFlame::Regime::Extinguished,
              "cool flame must reach the extinguished regime");
        CHECK(flame.state().heatReleaseW == 0.0,
              "heat release must be cleared at cool-flame fuel exhaustion");
        CHECK(flame.state().burnFraction > 0.999,
              "cool flame must consume the remaining fuel");
    }

    // --- cool→hot re-ignition: reachable through a live atmosphere update
    //     (restoring cabin O2 must not reset fuel/regime/elapsed state) ---
    {
        Chamber ch(risks);
        Chamber::Config c;
        c.materialId = "heptane";
        c.model = "droplet";
        c.o2Pct = 10.5;
        c.dropletD0Mm = 1.0; // enough fuel to outlive the cool phase
        c.seed = 3;
        ch.configure(c);

        const double dt = 0.01;
        bool sawCool = false;
        for (int i = 0; i < 3000 && !sawCool && !ch.finished(); ++i) {
            ch.step(dt);
            sawCool = ch.coolFlame();
        }
        CHECK(sawCool, "droplet must be in cool flame before O2 restoration");
        CHECK(!ch.finished(), "droplet must still hold fuel for re-ignition");

        // cabin airflow restored → O2 back above the material LOC
        ch.updateAtmosphere(18.0, 0.0, 101.0);
        CHECK(ch.coolFlame(), "atmosphere update must preserve the cool flame");

        bool reignited = false;
        for (int i = 0; i < 20000 && !reignited && !ch.finished(); ++i) {
            ch.step(dt);
            reignited = ch.hotBurning();
        }
        CHECK(reignited, "restored O2 must allow cool→hot re-ignition");

        const auto events = ch.drainEvents();
        CHECK(hasEvent(events, "cool-flame-onset"),
              "chamber must emit cool-flame-onset");
        CHECK(hasEvent(events, "reignited"), "chamber must emit reignited");
    }

    // --- LOC gate: PMMA below its LOC must not sustain flame ---
    {
        Chamber ch(risks);
        Chamber::Config c;
        c.materialId = "pmma";
        c.model = "spread";
        c.o2Pct = 12.0; // below PMMA LOC=15
        c.flowCms = 5.0;
        ch.configure(c);
        for (int i = 0; i < 500; ++i) ch.step(0.02);
        CHECK(!ch.hotBurning(), "PMMA must not spread below LOC");
    }

    // --- spread rate: inside the material's measured [min,max] range and
    //     the pyrolysis front must integrate at the reported rate ---
    {
        SolidSpread spread;
        SolidSpread::Config c;
        c.material = *risks.get("pmma");
        c.o2Pct = 21.0;
        c.flowCms = 0.0;      // quiescent → no flow multiplier
        c.slabLengthCm = 5.0; // short slab → traverses quickly
        spread.configure(c);

        const auto& m = c.material;
        const double dt = 0.02;
        bool rateOk = true, integrates = true;
        double prevFront = -1;
        int spreadingSteps = 0;
        for (int i = 0; i < 4000 &&
             spread.state().regime != SolidSpread::Regime::Out; ++i) {
            spread.step(dt);
            const auto& s = spread.state();
            if (s.regime != SolidSpread::Regime::Spreading) {
                prevFront = -1;
                continue;
            }
            ++spreadingSteps;
            if (s.spreadRateCms < m.spreadMinCms - 1e-9 ||
                s.spreadRateCms > m.spreadMaxCms + 1e-9)
                rateOk = false;
            if (prevFront >= 0 &&
                std::fabs(s.frontPosCm - prevFront - s.spreadRateCms * dt) > 1e-9)
                integrates = false;
            prevFront = s.frontPosCm;
        }
        CHECK(spreadingSteps > 50, "PMMA must be spreading at 21% O2");
        CHECK(rateOk, "quiescent spread rate must stay in the measured range");
        CHECK(integrates, "front must advance by spreadRateCms*dt each step");
        CHECK(spread.state().regime == SolidSpread::Regime::Out,
              "flame must traverse the slab and burn out");
    }

    // --- PSI-fitted K: a material with burnRateK0/KO2 burns at the
    //     measured rate K = k0 + slope·o2, not the pressure-derived one ---
    {
        DropletFlame flame;
        DropletFlame::Config c;
        c.material = *risks.get("heptane");
        c.material.burnRateK0Mm2s = 0.2317;
        c.material.burnRateKO2Mm2sPct = 0.01522;
        c.o2Pct = 21.0;
        c.dropletD0Mm = 1.0;
        c.seed = 7;
        flame.configure(c);
        const double expect = 0.2317 + 0.01522 * 21.0; // pScale = 1
        CHECK(std::fabs(flame.burnRateK() - expect) < 1e-9,
              "fitted material must burn at K = k0 + slope*o2");
    }

    // --- radiative extinction: a droplet at/above extinctionDHotMm loses
    //     the hot flame with nearly all fuel left (FLEX large-droplet
    //     regime); cool-flame chemistry may continue below it ---
    {
        DropletFlame flame;
        DropletFlame::Config c;
        c.material = *risks.get("heptane"); // coolFlameCapable
        c.material.extinctionDHotMm = 2.86;
        c.material.extinctionDMinMm = 0.77;
        c.o2Pct = 21.0;
        c.dropletD0Mm = 4.0; // above the radiative bound
        c.seed = 3;
        flame.configure(c);

        double lastHotD = 0;
        for (int i = 0; i < 4000 &&
             flame.state().regime != DropletFlame::Regime::Extinguished; ++i) {
            flame.step(0.01);
            if (flame.state().regime == DropletFlame::Regime::HotFlame)
                lastHotD = flame.state().dropletDMm;
        }
        CHECK(flame.state().regime == DropletFlame::Regime::Extinguished,
              "large droplet must extinguish");
        CHECK(flame.state().dropletDMm >= 0.5,
              "radiative/terminal extinction must leave fuel — not fuel-out");
        // the hot flame may only die at/above the radiative bound or at
        // the terminal diameter — it must never hot-burn to fuel-out
        CHECK(lastHotD <= 0.0 || lastHotD >= 0.77,
              "hot flame must die at a measured extinction boundary");
    }

    // --- terminal diameter: a droplet burning down through
    //     extinctionDMinMm dies with fuel left (recorded Dext) ---
    {
        DropletFlame flame;
        DropletFlame::Config c;
        c.material = *risks.get("heptane");
        c.material.coolFlameCapable = false; // isolate hot-flame death
        c.material.extinctionDMinMm = 0.8;
        c.o2Pct = 21.0;
        c.dropletD0Mm = 1.5;
        c.seed = 5;
        flame.configure(c);
        for (int i = 0; i < 4000 &&
             flame.state().regime != DropletFlame::Regime::Extinguished; ++i)
            flame.step(0.01);
        CHECK(flame.state().regime == DropletFlame::Regime::Extinguished,
              "droplet must reach the terminal diameter and die");
        CHECK(flame.state().dropletDMm > 0.7 &&
              flame.state().dropletDMm <= 0.8,
              "droplet must die at extinctionDMinMm, not fuel-out");
        CHECK(flame.state().burnFraction < 0.95,
              "terminal extinction must leave measurable fuel");
    }

    // --- closed chamber: O2 depletion must be emergent — a sealed cabin
    //     loses O2 to combustion and the flame dies below LOC with slab
    //     fuel still unburned (a droplet's ~mg fuel load cannot deplete
    //     a cabin; the spread front's ~g-scale load can) ---
    {
        Chamber ch(risks);
        Chamber::Config c;
        c.materialId = "pmma";
        c.model = "spread";
        c.o2Pct = 21.0;
        c.flowCms = 5.0;
        c.slabLengthCm = 30.0;
        c.volumeLiters = 50.0;   // small sealed cabin
        c.ventPerSec = 0.0;      // no make-up air
        ch.configure(c);

        const double dt = 0.02;
        bool sawSpreading = false;
        for (int i = 0; i < 200000 && !ch.finished(); ++i) {
            ch.step(dt);
            sawSpreading = sawSpreading || ch.hotBurning();
        }
        CHECK(sawSpreading, "flame must establish before depleting O2");
        CHECK(ch.chamberO2Pct() >= 0.0,
              "chamber O2 must stay inside [0, initial]");
        CHECK(ch.chamberO2Pct() < 15.0,
              "sealed cabin must deplete O2 below the PMMA LOC");
        const auto events = ch.drainEvents();
        CHECK(hasEvent(events, "o2-below-loc"),
              "crossing LOC in a sealed cabin must emit o2-below-loc");
    }

    // --- ventilation: make-up air must hold chamber O2 near ambient ---
    {
        Chamber ch(risks);
        Chamber::Config c;
        c.materialId = "pmma";
        c.model = "spread";
        c.o2Pct = 21.0;
        c.flowCms = 5.0;
        c.slabLengthCm = 30.0;
        c.volumeLiters = 50.0;
        c.ventPerSec = 0.5;      // half a cabin exchange per second
        c.ambientO2Pct = 21.0;
        ch.configure(c);
        for (int i = 0; i < 200000 && !ch.finished(); ++i) ch.step(0.02);
        CHECK(ch.chamberO2Pct() > 16.0,
              "ventilated cabin must hold O2 near ambient");
        CHECK(ch.finished(), "ventilated cabin must still burn to completion");
    }

    // --- suppressants: CO2 dilutes the effective O2 the flame sees ---
    {
        Chamber ch(risks);
        Chamber::Config c;
        c.materialId = "pmma";
        c.model = "spread";
        c.o2Pct = 21.0;
        c.flowCms = 5.0;
        c.slabLengthCm = 30.0;
        ch.configure(c);
        ch.step(0.02);
        const double eff0 = ch.effectiveO2Pct();
        CHECK(std::fabs(eff0 - 21.0) < 1e-9,
              "no suppressants → effective O2 equals measured");
        ch.setSuppressants(6.0, 0.0);  // 6% CO2 → -9.6 pp effective
        CHECK(ch.effectiveO2Pct() < 12.0,
              "CO2 flood must drag effective O2 below PMMA LOC");
        for (int i = 0; i < 2000 && !ch.finished(); ++i) ch.step(0.02);
        CHECK(!ch.hotBurning(),
              "PMMA flame must die under a CO2 suppressant flood");
    }

    // --- fitted logistic ignition: a material carrying ignitionLogitA/B
    //     + ignitionFitN>0 scores P = sigmoid(A + B·margin) instead of the
    //     hand-set curve; the −3pp dead band still applies on top ---
    {
        Material m = *risks.get("heptane");
        m.locPct = 16.0;
        m.ignitionLogitA = -2.579;
        m.ignitionLogitB = 0.148;
        m.ignitionFitN = 103;
        const double z = -2.579 + 0.148 * (21.0 - 16.0);
        const double expect = 1.0 / (1.0 + std::exp(-z));
        CHECK(std::fabs(MaterialRisk::ignitionPressure(m, 21.0) - expect) < 1e-9,
              "fitted material must score sigmoid(A + B*margin)");
        CHECK(MaterialRisk::ignitionPressure(m, 12.9) == 0.0,
              "dead band: no ignition pressure >3pp below LOC even when fitted");
        CHECK(MaterialRisk::ignitionPressure(m, 40.0) <= 1.0,
              "logistic output must stay inside [0,1]");
        // a null-fit material (all-extinct record) sits near zero
        Material null_m = m;
        null_m.ignitionLogitA = -6.9;
        null_m.ignitionLogitB = 0.0;
        CHECK(MaterialRisk::ignitionPressure(null_m, 30.0) < 0.01,
              "material-null fit must yield a near-zero pressure");
        // and monotonic in O2 like the hand curve
        CHECK(MaterialRisk::ignitionPressure(m, 18.0)
              < MaterialRisk::ignitionPressure(m, 25.0),
              "fitted logistic must be monotonic in O2");
    }

    // --- ignition pressure monotonic in O2 ---
    {
        const Material* pmma = risks.get("pmma");
        CHECK(pmma != nullptr, "pmma material must exist");
        const double p15 = MaterialRisk::ignitionPressure(*pmma, 15.0);
        const double p21 = MaterialRisk::ignitionPressure(*pmma, 21.0);
        const double p30 = MaterialRisk::ignitionPressure(*pmma, 30.0);
        CHECK(p15 < p21 && p21 < p30, "ignition pressure must grow with O2");
    }

    // --- native composite riskIndex = clamp01(P·F·H·G), the same
    //     contract as backend/services/risk.py + site/src/lib/risk.ts ---
    {
        const Material* hep = risks.get("heptane");
        CHECK(hep != nullptr, "heptane material must exist");
        const RiskBreakdown bd =
            MaterialRisk::riskBreakdown(*hep, 16.0, 20.0, "lunar");
        CHECK(bd.ignitionPressure > 0.0 && bd.ignitionPressure <= 1.0,
              "breakdown must carry the fitted ignition pressure");
        CHECK(bd.flowFactor > 0.0 && bd.hiddenFactor >= 1.0,
              "breakdown must carry flow + hazard factors");
        CHECK(std::fabs(bd.gravityFactor - 0.92) < 1e-9,
              "lunar gravity factor is 0.92");
        const double product =
            bd.ignitionPressure * bd.flowFactor * bd.hiddenFactor *
            bd.gravityFactor;
        CHECK(std::fabs(bd.riskIndex - std::min(1.0, product)) < 1e-9,
              "riskIndex must equal clamp01 of the factor product");
        CHECK(std::fabs(MaterialRisk::riskIndex(*hep, 16.0, 20.0, "lunar")
                        - bd.riskIndex) < 1e-9,
              "riskIndex helper must match the breakdown value");
        // dead band still wins: deep below LOC the index is exactly 0
        CHECK(MaterialRisk::riskIndex(*hep, 5.0, 20.0, "lunar") == 0.0,
              "dead band must zero the composite index");
        // earth gravity discounts the index vs microgravity
        CHECK(MaterialRisk::riskIndex(*hep, 16.0, 20.0, "earth")
              < MaterialRisk::riskIndex(*hep, 16.0, 20.0, "microgravity"),
              "earth gravity must reduce the index");
        // unknown material / unknown gravity degrade safely, not crash
        Material ghost;
        ghost.locPct = 15.0;
        CHECK(MaterialRisk::riskIndex(ghost, 20.0, 0.0, "deep-space")
              >= 0.0,
              "unknown gravity key must fall back to a valid factor");
    }

    if (failures == 0) std::printf("all physics checks passed\n");
    return failures ? 1 : 0;
}
