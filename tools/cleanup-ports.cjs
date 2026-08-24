/* cleanup-ports.cjs — 杀掉占用 8080/3001 的残留 dev 进程 */
const { execSync } = require("child_process");
function pidsOnPort(port) {
	try {
		const out = execSync(`netstat -ano | findstr ":${port} .*LISTENING"`, { shell: "cmd.exe" }).toString();
		return [...new Set(out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))];
	} catch { return []; }
}
for (const port of [8080, 3001]) {
	for (const pid of pidsOnPort(port)) {
		try {
			execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
			console.log(`killed ${pid} (port ${port})`);
		} catch (e) { console.log(`skip ${pid}: ${e.message.split("\n")[0]}`); }
	}
}
console.log("ports cleared");
