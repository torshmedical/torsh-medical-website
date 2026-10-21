const fs = require("node:fs");
const path = require("node:path");

const workerRoot = path.resolve(__dirname, "../cloudflare/contact-worker");
const esbuild = require(path.join(workerRoot, "node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild"));
const postalMimeEntry = path.join(
  workerRoot,
  "node_modules/.pnpm/postal-mime@4.0.7/node_modules/postal-mime/dist/esm/postal-mime.js"
);

const virtualDependencies = {
  name: "virtual-dependencies",
  setup(build) {
    build.onResolve({ filter: /^postal-mime$/ }, () => ({ path: postalMimeEntry, namespace: "virtual-file" }));
    build.onResolve({ filter: /^\./, namespace: "virtual-file" }, (args) => ({
      path: path.resolve(path.dirname(args.importer), args.path),
      namespace: "virtual-file"
    }));
    build.onLoad({ filter: /.*/, namespace: "virtual-file" }, (args) => ({
      contents: fs.readFileSync(args.path, "utf8"),
      loader: "js",
      resolveDir: path.dirname(args.path)
    }));
  }
};

esbuild.build({
  stdin: {
    contents: fs.readFileSync(path.join(workerRoot, "src/index.js"), "utf8"),
    sourcefile: "src/index.js",
    resolveDir: workerRoot,
    loader: "js"
  },
  absWorkingDir: workerRoot,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: path.join(workerRoot, "worker-bundle.js"),
  plugins: [virtualDependencies]
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
