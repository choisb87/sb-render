const { src, dest } = require('gulp');

function buildIcons() {
  // Copy any icon files if needed in the future
  return src('nodes/**/*.{png,svg}')
    .pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
