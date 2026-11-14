#pragma once

#include <string>
#include <vector>

#include "airflow_propagator.hpp"
#include "combustion_solver.hpp"
#include "material_risk.hpp"

namespace ff {

/**
 * Game-facing experiment chamber. Aggregates the reduced-order models and
 * reports the physical quantities the sim layer consumes:
 * ignition pressure, flame radius / spread front, regime transitions
 * (incl. cool-flame onset and smolder re-ignition windows).
 */
class Chamber {
  public:
    struct Config {
        std::string investigationId;
        std::string materialId;
        std::string model = "spread"; // "droplet" | "spread"
        double o2Pct = 21.0;
        double flowCms = 0.0;
        double pressureKpa = 101.0;
        double slabLengthCm = 30.0;
        double dropletD0Mm = 1.0;
        bool partialGravity = false;
        unsigned int seed = 1u;
        // ---- closed-chamber gas balance (0/disabled = open atmosphere) ----
        double volumeLiters = 0.0;   // sealed/vented gas volume
        double ambientO2Pct = -1.0;  // ventilation supply; <0 = use o2Pct
        double ventPerSec = 0.0;     // air-exchange rate, 1/s (0 = sealed)
        double co2Pct = 0.0;         // suppressant in chamber, %
        double hePct = 0.0;
    };

    Chamber();
    explicit Chamber(MaterialRisk risks);

    void configure(const Config& cfg);
    void step(double dtSec);

    /**
     * Change the chamber atmosphere mid-run (O₂, opposed flow, pressure).
     * Forwards to the active model without resetting its state — enables
     * cool-flame re-ignition when O₂ is restored and live extinction when
     * it is depleted.
     */
    void updateAtmosphere(double o2Pct, double flowCms, double pressureKpa);

    /**
     * Inject/remove suppressants mid-run (CO₂ flood, He purge). The
     * sub-models see the *effective* O₂ (measured O₂ minus diluent
     * penalty); the chamber telemetry keeps the measured value.
     */
    void setSuppressants(double co2Pct, double hePct);

    /** measured chamber O₂ — evolves in closed-volume mode */
    double chamberO2Pct() const { return chamberO2Pct_; }
    /** O₂ the flame actually sees: measured minus CO₂/He diluent penalty */
    double effectiveO2Pct() const;

    /** 0..1 relative ignition pressure at the configured atmosphere */
    double ignitionPressure() const;

    int regime() const;            // active model's regime as int
    bool hotBurning() const;
    bool coolFlame() const;        // hidden-combustion flag for the game
    bool finished() const;

    /** serializable state snapshot for transport (WS / wasm) */
    std::string stateJson() const;

    /** events emitted since last drain, e.g. "cool-flame-onset" */
    std::vector<std::string> drainEvents();

    const Config& config() const { return cfg_; }

  private:
    MaterialRisk risks_;
    Config cfg_;
    DropletFlame droplet_;
    SolidSpread spread_;
    bool useDroplet_ = true;
    bool ignited_ = false;
    int lastRegime_ = -1;
    std::vector<std::string> events_;
    double chamberO2Pct_ = 21.0;
    bool o2BelowLoc_ = false;

    /** instantaneous fuel consumption, kg/s — feeds the O₂ balance */
    double fuelRateKgS() const;
    /** gas exchange + combustion depletion for closed-volume mode */
    void stepAtmosphere(double dtSec);
    /** push the effective atmosphere into both sub-models */
    void pushAtmosphere();
};

} // namespace ff
