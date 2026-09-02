
const { execSync } = require("child_process");
try { execSync("del tools\\test-slash.cjs", { encoding: "utf8" }); } catch(e) {}
console.log("cleaned");
