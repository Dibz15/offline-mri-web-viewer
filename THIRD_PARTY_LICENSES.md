# Third-Party Licenses

This project's own code is licensed under Apache-2.0 (see [`LICENSE`](./LICENSE)).
The built `dist/index.html` also embeds the following third-party software,
whose licenses apply to those embedded portions.

## NiiVue

This app is built almost entirely on top of **[NiiVue](https://github.com/niivue/niivue)**
by the NiiVue authors (Chris Rorden and contributors), a WebGL2-based medical
image viewer. `dist/index.html` inlines NiiVue's own prebuilt UMD bundle
(`@niivue/niivue`, `dist/niivue.umd.js`) verbatim, unmodified.

```
@niivue/niivue
Copyright (c) niivue authors
License: BSD 2-Clause "Simplified" License
https://github.com/niivue/niivue

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

For the exact, current license text see NiiVue's own repository:
<https://github.com/niivue/niivue/blob/main/LICENSE>

## NiiVue's bundled dependencies

NiiVue's own prebuilt bundle statically includes a handful of its own
third-party dependencies (notably [gl-matrix](https://github.com/toji/gl-matrix)
(MIT), [fflate](https://github.com/101arrowz/fflate) (MIT),
[nifti-reader-js](https://github.com/rii-mango/NIFTI-Reader-JS) (MIT), and
[zarrita](https://github.com/manzt/zarrita.js) (MIT), among others). These
arrive inside the vendored NiiVue bundle unmodified; this project does not
depend on or redistribute them separately. See NiiVue's own
[`package.json`](https://github.com/niivue/niivue/blob/main/packages/niivue/package.json)
for the complete, current list.

## This project's own code

Everything under `src/` and `scripts/` (the viewer UI, controls, and build
tooling) is original work by this project's contributors, licensed under
Apache-2.0 — see [`LICENSE`](./LICENSE).
