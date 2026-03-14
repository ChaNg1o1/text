module.exports = {
  ci: {
    collect: {
      // We collect manually via bench.sh — LHCI only handles upload.
      // Point at the report already produced by bench.sh.
      staticDistDir: "./out",
      url: ["http://localhost:4173/"],
      numberOfRuns: 1,
      settings: {
        onlyCategories: ["performance"],
        chromeFlags: "--headless --no-sandbox --disable-gpu",
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
