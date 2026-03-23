const m = require("web-tree-sitter");
console.log("keys:", Object.keys(m).slice(0, 8));
console.log("typeof default:", typeof m.default);
console.log("typeof m:", typeof m);

// Try m.default
if (typeof m.default === "function") {
  console.log("m.default is function — using as Parser");
  await m.default.init();
  console.log("init OK");
  const p = new m.default();
  console.log("new m.default() OK:", typeof p);
} else if (typeof m === "function") {
  console.log("m is function — using as Parser");
  await m.init();
  const p = new m();
  console.log("new m() OK:", typeof p);
} else {
  console.log("trying m.default.default...");
  console.log("m.default:", m.default);
  console.log("m.default keys:", Object.keys(m.default || {}));
}
