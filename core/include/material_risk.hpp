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

    // ---- measured droplet constants (fit_risk_model.py, PSI data) ----
    // All zero means "no PSI fit" — the solver falls back to the
    // ignition-pressure-derived rate.

    /** d²-law rate intercept: K(o2) = k0 + kSlope·o2, mm²/s — fitted on
     *  measured kavg, not derived from the ignition curve */
    double burnRateK0Mm2s = 0.0;
    /** d²-law rate slope per %O2, mm²/s per pct */
    double burnRateKO2Mm2sPct = 0.0;
    /** hot-flame extinction diameter, mm — droplets at/above this size
     *  lose the hot flame to radiative loss (FLEX radiative regime);
     *  cool-flame chemistry may continue below it. 0 = disabled */
    double extinctionDHotMm = 0.0;
    /** minimum sustainable droplet diameter, mm — the measured terminal
     *  extinction diameter: below it no combustion regime survives, hot
     *  or cool (droplets die with fuel left). 0 = burn to fuel-out */
    double extinctionDMinMm = 0.0;

    // ---- fitted ignition-pressure logistic (fit_risk_model.py) ----
    // P(sustained burn | margin) = sigmoid(A + B·margin). Scope of the
    // fit (material / material-null / family:<name>) is metadata in
    // calibration.json — the engine only needs the coefficients.
    // ignitionFitN <= 0 means "no fit — use the hand-set curve".
    double ignitionLogitA = 0.0;
    double ignitionLogitB = 0.0;
    double ignitionFitN = 0.0;
};

/**
 * Fitted coflow extinction constants for one gaseous fuel (ACME CFI-G).
 * The CFI tables ran two extinction protocols, so the criterion has two
 * branches: a fuel mass-flow ramp rate above rateCrit blows the flame
 * off (strain extinction), and an oxidizer ramp ending below extO2Pct
 * starves it (oxygen-depletion extinction). ignO2Pct / minFlowMgs gate
 * ignition. rateCrit <= 0 disables the fuel-ramp branch.
 */
struct CoflowFit {
    double ignO2Pct = 0.0;
    double minFlowMgs = 0.0;
    double extO2Pct = 0.0;
    double rateCrit = 0.0;  // mg/s per second; <=0 = disabled
    int fitN = 0;
    double fitAccuracy = 0.0;
};

/** coflow replay verdict — mirrors normalize outcomes */
enum class CoflowOutcome { Burn = 0, Extinction = 1, NoIgnition = 2 };

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

    /**
     * Ventilation factor F_flow(flow), shared with the risk model:
     * piecewise anchors — quiescent radiative dip, mid-flow O2-supply
     * boost, high-flow blow-off quench. loadJson() reads "flowAnchors"
     * from calibration.json (canonical); a built-in table mirrors it.
     */
    static double flowFactor(double flowCms);

    /** midpoint spread rate, cm/s */
    static double midSpread(const Material& m) {
        return 0.5 * (m.spreadMinCms + m.spreadMaxCms);
    }

    /**
     * Reduced-order coflow outcome for an ACME-style burner run:
     * ignition gates first (low O2, end-of-ramp fuel flow under the
     * minimum sustainable coflow rate), then the two measured
     * extinction branches. Falls back to the pooled "_default" fit
     * for fuels without enough labeled runs; returns NoIgnition when
     * no coflow data exists at all.
     */
    CoflowOutcome coflowOutcome(const std::string& fuel, double o2Pct,
                                double o2EndPct, double mfLo,
                                double mfHi, double burnTimeS) const;

    const CoflowFit* coflow(const std::string& fuel) const;

  private:
    std::unordered_map<std::string, Material> table_;
    std::unordered_map<std::string, CoflowFit> coflow_;
};

} // namespace ff
