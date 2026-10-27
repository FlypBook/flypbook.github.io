// Loads every 3D gameplay scene, then tells the app they're ready.
// Each group loads on its own, so one broken scene file can't take the rest down.
import "./game3d.js";

const groups = ["./games_ride.js", "./games_fp.js", "./games_satisfy.js", "./games_arcade.js"];
const results = await Promise.allSettled(groups.map(g => import(g)));
results.forEach((r, i) => { if (r.status === "rejected") console.error(`Couldn't load ${groups[i]}:`, r.reason); });
window.resolveGames();
