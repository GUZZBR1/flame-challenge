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
    };

    Chamber();
    explicit Chamber(MaterialRisk risks);

    void configure(const Config& cfg);
    void step(double dtSec);

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
};

} // namespace ff
