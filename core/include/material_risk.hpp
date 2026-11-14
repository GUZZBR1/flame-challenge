#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace ff {

/**
 * ACME-style material flammability matrix.
 * Constants are calibrated from NASA PSI investigation records
 * (see shared/calibrated-data/calibration.json).
 */
struct Material {
    std::string id;
    std::string name;
    /** limiting oxygen concentration below which flame cannot sustain (%) */
    double locPct = 17.0;
    /** flame spread range over the material, cm/s */
    double spreadMinCms = 0.2;
    double spreadMaxCms = 4.0;
    /** 0..1 — sooting propensity (ACME burner measurements) */
    double sootIndex = 0.3;
    /** supports low-temperature (cool) flame chemistry — FLEX fuels */
    bool coolFlameCapable = false;
    /** supports smoldering re-ignition — cotton/Nomex-type solids */
    bool smoldering = false;
};

class MaterialRisk {
  public:
    MaterialRisk();

    /** replace/extend the table from a JSON document (calibration.json) */
    void loadJson(const std::string& json);

    const Material* get(const std::string& id) const;
    std::vector<Material> all() const;

    /**
     * Relative ignition pressure of a material in a given atmosphere:
     * 0 at/below LOC, rising ~quadratically above it.
     */
    static double ignitionPressure(const Material& m, double o2Pct);

    /** midpoint spread rate, cm/s */
    static double midSpread(const Material& m) {
        return 0.5 * (m.spreadMinCms + m.spreadMaxCms);
    }

  private:
    std::unordered_map<std::string, Material> table_;
};

} // namespace ff
