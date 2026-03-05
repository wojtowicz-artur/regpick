# Changelog

## [0.20.1](https://github.com/wojtowicz-artur/regpick/compare/v0.20.0...v0.20.1) (2026-03-05)

### Chores

* remove @effect/schema dependency from package.json ([6b36af6](https://github.com/wojtowicz-artur/regpick/commit/6b36af63f1ff874f0c84bd059bd74f6812a4f89f))

### Code Refactoring

* segregate monolithic Runtime into granular Context Tags ([daf8ed0](https://github.com/wojtowicz-artur/regpick/commit/daf8ed06db0387601cfce9f2b01a7fd8fc332716))

## [0.20.0](https://github.com/wojtowicz-artur/regpick/compare/v0.19.1...v0.20.0) (2026-03-05)

### Features

* enhance error handling by introducing specific error types and updating related tests ([8c88f99](https://github.com/wojtowicz-artur/regpick/commit/8c88f99b4975a44588f62e828d0fc751225b9068))

## [0.19.1](https://github.com/wojtowicz-artur/regpick/compare/v0.19.0...v0.19.1) (2026-03-05)

### Bug Fixes

* invalid usage on process.cwd ([d2fc9a7](https://github.com/wojtowicz-artur/regpick/commit/d2fc9a71cd2db700186554e46afee41841bbdc41))

## [0.19.0](https://github.com/wojtowicz-artur/regpick/compare/v0.18.0...v0.19.0) (2026-03-05)

### Features

* drop v1 compatibility and enhance list command UI -m ([4aae582](https://github.com/wojtowicz-artur/regpick/commit/4aae582a236ffc6caccdd0a8f0c1b3c27da1e95e))

### Code Refactoring

* add command and orchestrator for improved modularity and readability ([f7916e2](https://github.com/wojtowicz-artur/regpick/commit/f7916e2a146cce5784266bcc4ea9896f33a92a66))
* extract orchestrators for init, list, and pack commands to improve modularity ([7ff3f90](https://github.com/wojtowicz-artur/regpick/commit/7ff3f900c55f453106c4c22b9517d4ebcf918d99))
* reorganize update command logic and introduce update orchestrator ([633b1f9](https://github.com/wojtowicz-artur/regpick/commit/633b1f9574640668f0da41d517d1c924208d9024))
* simplify code by consolidating imports and streamlining function logic ([3ca3a2f](https://github.com/wojtowicz-artur/regpick/commit/3ca3a2fc6af11b9733b1f47ded13283bf31bac09))
* streamline test setup and improve code readability across multiple files ([4c5aeec](https://github.com/wojtowicz-artur/regpick/commit/4c5aeecacca57275d324eee32bf402b1056f97f9))

## [0.18.0](https://github.com/wojtowicz-artur/regpick/compare/v0.17.0...v0.18.0) (2026-03-04)

### Features

* restructure project by moving config and lockfile handling to domain and core layers ([aa9205b](https://github.com/wojtowicz-artur/regpick/commit/aa9205be51053e9870fa28118edd4fc378458c22))

### Code Refactoring

* replace PipelineRenderer with runPipeline in add and update commands ([da282e5](https://github.com/wojtowicz-artur/regpick/commit/da282e5d26cba44ddcd2806bd8f39472eddb636c))
* streamline code by removing unnecessary line breaks and improving readability ([6cfabdb](https://github.com/wojtowicz-artur/regpick/commit/6cfabdb04d77a7a0304110e0f298994f8a5cc846))

## [0.17.0](https://github.com/wojtowicz-artur/regpick/compare/v0.16.8...v0.17.0) (2026-03-04)

### Features

* implement crash journal for partial failure recovery ([5a90fc3](https://github.com/wojtowicz-artur/regpick/commit/5a90fc3b28ee3e94e8fa7b6d0b08610effaff853))

## [0.16.8](https://github.com/wojtowicz-artur/regpick/compare/v0.16.7...v0.16.8) (2026-03-04)

### Code Refactoring

* **core:** reorder add plugin steps to prevent partial failures ([4d4c291](https://github.com/wojtowicz-artur/regpick/commit/4d4c2914782e38955d828ded6367da277fef0b26))

## [0.16.7](https://github.com/wojtowicz-artur/regpick/compare/v0.16.6...v0.16.7) (2026-03-04)

## [0.16.5](https://github.com/wojtowicz-artur/regpick/compare/v0.16.4...v0.16.5) (2026-03-04)

### Code Refactoring

* command execution to use Effect for better error handling ([c8ebb5c](https://github.com/wojtowicz-artur/regpick/commit/c8ebb5c5bc46c2c3484b8828fca6f292547a45b2))
* migrate commands and tests to use Effect for improved error handling and async flow ([288ea8d](https://github.com/wojtowicz-artur/regpick/commit/288ea8dbfd258c07f55dfd6e676a37445e83bd0f))
* streamline registry loading and error handling using Effect ([aedf340](https://github.com/wojtowicz-artur/regpick/commit/aedf340e847d3da38d7e37430a45f812a736e58f))
* update error handling in add and update commands to use Effect for improved async flow ([49c5b0c](https://github.com/wojtowicz-artur/regpick/commit/49c5b0cd21a24682f5b594eb1bb9b9e89ae43e53))

## [0.16.4](https://github.com/wojtowicz-artur/regpick/compare/v0.16.3...v0.16.4) (2026-03-03)

### Code Refactoring

* migrate list and update commands to use Effect for better error handling and async flow ([b0fc259](https://github.com/wojtowicz-artur/regpick/commit/b0fc259ffe4a967c7a3e5b1ca34306f3441118f2))

## [0.16.3](https://github.com/wojtowicz-artur/regpick/compare/v0.16.2...v0.16.3) (2026-03-03)

### Code Refactoring

* migrate from Result type to Either in command functions ([b5dcb58](https://github.com/wojtowicz-artur/regpick/commit/b5dcb5893945dc322e6ef560c10758433db76377))
* migrate from valibot to effect for schema validation and error handling ([1138231](https://github.com/wojtowicz-artur/regpick/commit/11382314125d5a1ec386f067ab3f98aaa613ca28))
* replace Result type with Either in various modules ([1636562](https://github.com/wojtowicz-artur/regpick/commit/163656272a5810d85583e70d3621d62afed019a5))

## [0.16.2](https://github.com/wojtowicz-artur/regpick/compare/v0.16.1...v0.16.2) (2026-03-03)

### Performance Improvements

* implement KeyedMutex for concurrent and thread-safe VFS processing ([8c9053a](https://github.com/wojtowicz-artur/regpick/commit/8c9053a6f5994d76976a360e4f4305cada984c93))

## [0.16.1](https://github.com/wojtowicz-artur/regpick/compare/v0.16.0...v0.16.1) (2026-03-03)

### Code Refactoring

* enhance plugin retrieval logic to ensure proper object validation ([939f14d](https://github.com/wojtowicz-artur/regpick/commit/939f14d19bc74579deb30d728f287184ac4c5267))
* improve plugin handling and configuration validation across commands ([4aef175](https://github.com/wojtowicz-artur/regpick/commit/4aef175ba6f4fa4f2d4134841dbadda088484b47))
* replace legacy RegistryAdapter architecture with unified RegpickPlugin system ([2b89c5d](https://github.com/wojtowicz-artur/regpick/commit/2b89c5d994eb7caa7538f0f03d918fc871bb18a9))

## [0.16.0](https://github.com/wojtowicz-artur/regpick/compare/v0.15.0...v0.16.0) (2026-03-03)

### Features

* enhance flushToDisk method to handle directory creation and error reporting ([3849e65](https://github.com/wojtowicz-artur/regpick/commit/3849e658291032ecc35d4ed3e2e9d0c7203fb24a))

## [0.15.0](https://github.com/wojtowicz-artur/regpick/compare/v0.14.0...v0.15.0) (2026-03-03)

### Features

* update config file handling to support multiple formats and improve initialization logic ([0cd9bf9](https://github.com/wojtowicz-artur/regpick/commit/0cd9bf9e470797383d748a2bd3b7cd92ce6bec2b))

## [0.14.0](https://github.com/wojtowicz-artur/regpick/compare/v0.13.0...v0.14.0) (2026-03-03)

### Features

* refactor to Vite-like domain-driven architecture ([3cf5eb6](https://github.com/wojtowicz-artur/regpick/commit/3cf5eb60a5c7c7815a1887dc7865451010cc58cf))

## [0.13.0](https://github.com/wojtowicz-artur/regpick/compare/v0.12.0...v0.13.0) (2026-03-03)

### Features

* add registry adapter schema validation and improve adapter loading logic ([4993b4d](https://github.com/wojtowicz-artur/regpick/commit/4993b4d3f5bf7ec22c86083a18a0b9fcea672b61))

### Bug Fixes

* **vfs:** implement onError hooks, strict path normalizing, and support buffers ([7ff3f1f](https://github.com/wojtowicz-artur/regpick/commit/7ff3f1ff767151ff4a7c8d53ae05134901f57dd4))

### Code Refactoring

* format async function parameters and improve comments in VFS and PipelineRenderer ([89162e5](https://github.com/wojtowicz-artur/regpick/commit/89162e561f9e9f581a1091435379feba0cd368fb))
* remove saga steps and implementing direct file operations ([3cd863f](https://github.com/wojtowicz-artur/regpick/commit/3cd863fa9157b3a860cbcaa7d8efb4c27f7b6e54))

## [0.12.0](https://github.com/wojtowicz-artur/regpick/compare/v0.11.0...v0.12.0) (2026-03-02)

### Features

* introduce custom path resolver plugins ([5ac35bd](https://github.com/wojtowicz-artur/regpick/commit/5ac35bd2e4af54b994b576155f410ae2f3c65aa7))

## [0.11.0](https://github.com/wojtowicz-artur/regpick/compare/v0.10.1...v0.11.0) (2026-03-02)

### Features

* enhance registry adapter system with improved source tracking and state management ([07da138](https://github.com/wojtowicz-artur/regpick/commit/07da138d194a1bc32688cec29c2067334aea5792))
* implement extensible package manager plugin architecture ([2844630](https://github.com/wojtowicz-artur/regpick/commit/2844630d600e6b3a8e506ee60b987b379199ca06))
* implement extensible registry adapter system ([d27d331](https://github.com/wojtowicz-artur/regpick/commit/d27d331b0255e55a482967936dff96611f904a6d))

## [0.10.1](https://github.com/wojtowicz-artur/regpick/compare/v0.10.0...v0.10.1) (2026-03-01)

### Code Refactoring

* refactor command implementations to utilize a CQS pattern ([31ab07c](https://github.com/wojtowicz-artur/regpick/commit/31ab07cb91208673980d702f09b0ad5f6f286b88))
* streamline error handling in queryInstallPlanState function ([e0b2792](https://github.com/wojtowicz-artur/regpick/commit/e0b279242c806ea35e1c5312861d747e2da945c5))

## [0.10.0](https://github.com/wojtowicz-artur/regpick/compare/v0.9.4...v0.10.0) (2026-03-01)

### Features

* implement graceful rollbacks (SIGINT) and migrate update command to Saga ([ef7d3db](https://github.com/wojtowicz-artur/regpick/commit/ef7d3db159b515755b6abb9b77003421011f77fc))

## [0.9.4](https://github.com/wojtowicz-artur/regpick/compare/v0.9.3...v0.9.4) (2026-03-01)

### Code Refactoring

* add formatting step to pre-commit hook ([bb67973](https://github.com/wojtowicz-artur/regpick/commit/bb679734de36cf34cfdea2ca0a1ca7ff564e643c))

## [0.9.3](https://github.com/wojtowicz-artur/regpick/compare/v0.9.2...v0.9.3) (2026-03-01)

### Code Refactoring

* optimize file handling and error management in command execution ([e23b715](https://github.com/wojtowicz-artur/regpick/commit/e23b7156ad22afa0bfe6b4a6eae0cdd7e7d21a2e))

## [0.9.2](https://github.com/wojtowicz-artur/regpick/compare/v0.9.1...v0.9.2) (2026-03-01)

### Code Refactoring

* update import paths to use .js extensions and enhance type definitions ([9485387](https://github.com/wojtowicz-artur/regpick/commit/94853874fa5105a55dde0b28aedc58a6cb5ff52b))

## [0.9.1](https://github.com/wojtowicz-artur/regpick/compare/v0.9.0...v0.9.1) (2026-03-01)

### Code Refactoring

* enforce strict runtime type boundaries with valibot and format codebase ([1a20bd5](https://github.com/wojtowicz-artur/regpick/commit/1a20bd57d6e621455a37c0815536c6c2f7a498c6))

## [0.9.0](https://github.com/wojtowicz-artur/regpick/compare/v0.8.0...v0.9.0) (2026-03-01)

### Features

* add valibot for schema validation and enhance registry dependency resolution ([eba8c20](https://github.com/wojtowicz-artur/regpick/commit/eba8c2095019c437fef171eba42a161b3e74dd28))

### Styles

* format code for consistency and readability ([cdf79f7](https://github.com/wojtowicz-artur/regpick/commit/cdf79f70e5121287a69ede7dffca4c67f6aea579))

## [0.8.0](https://github.com/wojtowicz-artur/regpick/compare/v0.7.0...v0.8.0) (2026-03-01)

### Features

* use absolute paths with aliases and add e2e tests ([9b75766](https://github.com/wojtowicz-artur/regpick/commit/9b75766b2965b2d5f15704575b55025b6c0a021f))

## [0.7.0](https://github.com/wojtowicz-artur/regpick/compare/v0.6.8...v0.7.0) (2026-03-01)

### Features

* add Vercel Analytics integration and update Hero component version ([d199ab3](https://github.com/wojtowicz-artur/regpick/commit/d199ab3f4d59dd0efcb29891e64d4ce234fa08b4))

## [0.6.8](https://github.com/wojtowicz-artur/regpick/compare/v0.6.7...v0.6.8) (2026-03-01)

### Code Refactoring

* streamline prompt handling and improve code formatting in init and list commands ([1dd154b](https://github.com/wojtowicz-artur/regpick/commit/1dd154b51d7c890f627cd49787f5bf12e4b173d2))

## [0.6.7](https://github.com/wojtowicz-artur/regpick/compare/v0.6.6...v0.6.7) (2026-03-01)

### Code Refactoring

* improve user cancellation handling in prompt functions ([561b440](https://github.com/wojtowicz-artur/regpick/commit/561b440c73990daad0f34a24ae09495d92eae1fa))

## [0.6.6](https://github.com/wojtowicz-artur/regpick/compare/v0.6.5...v0.6.6) (2026-02-28)

### Code Refactoring

* improve code formatting and enhance GitHub URL handling in registry functions ([cfe4264](https://github.com/wojtowicz-artur/regpick/commit/cfe42641f73970eaf8f983b519f02fdb2259be9a))

## [0.6.5](https://github.com/wojtowicz-artur/regpick/compare/v0.6.4...v0.6.5) (2026-02-28)

### Code Refactoring

* enhance config reading logic and improve prompt interface with async imports ([bcee748](https://github.com/wojtowicz-artur/regpick/commit/bcee7481ce0d97e0c6cae3d27ffe1ecb816c0f58))

## [0.6.4](https://github.com/wojtowicz-artur/regpick/compare/v0.6.3...v0.6.4) (2026-02-28)

### Code Refactoring

* update diff implementation to use dynamic import and change TypeScript target to esnext ([ec3037c](https://github.com/wojtowicz-artur/regpick/commit/ec3037cc5c589c081ef29424a081099b3367fca1))

## [0.6.3](https://github.com/wojtowicz-artur/regpick/compare/v0.6.2...v0.6.3) (2026-02-28)

### Code Refactoring

* lazy load command modules and improve runtime initialization ([930d80b](https://github.com/wojtowicz-artur/regpick/commit/930d80b487dcbd8c1a73f37c84be9c9f089ab3ff))

## [0.6.2](https://github.com/wojtowicz-artur/regpick/compare/v0.6.1...v0.6.2) (2026-02-28)

### Code Refactoring

* clean up formatting and improve readability in pack.ts ([519401f](https://github.com/wojtowicz-artur/regpick/commit/519401faa28a3478ff47c92eee23b0eb32339118))

## [0.6.1](https://github.com/wojtowicz-artur/regpick/compare/v0.6.0...v0.6.1) (2026-02-28)

### Bug Fixes

* update Node.js engine requirement and remove unused dependencies ([b11a5f6](https://github.com/wojtowicz-artur/regpick/commit/b11a5f61fbbcae39cc9810fce4abf72c917fb930))

## [0.6.0](https://github.com/wojtowicz-artur/regpick/compare/v0.5.0...v0.6.0) (2026-02-28)

### Features

* update package dependencies, add unconfig, and implement readConfig tests ([aa74623](https://github.com/wojtowicz-artur/regpick/commit/aa74623c218c96be6f684527ecf19e62e78943f9))

## [0.5.0](https://github.com/wojtowicz-artur/regpick/compare/v0.4.0...v0.5.0) (2026-02-27)

### Features

* implement an animated 3D grid and particle background, replacing the previous orb animation ([9f2fac0](https://github.com/wojtowicz-artur/regpick/commit/9f2fac08f4e0fe06fb5e37098917ca087dc77067))

## [0.4.0](https://github.com/wojtowicz-artur/regpick/compare/v0.3.0...v0.4.0) (2026-02-27)

### Features

* redesign website hero section, update theme, enhance terminal UI ([5612898](https://github.com/wojtowicz-artur/regpick/commit/5612898386f23842eb3b73aab1306e3590701616))

## [0.3.0](https://github.com/wojtowicz-artur/regpick/compare/v0.2.12...v0.3.0) (2026-02-27)

### Features

* **website:** redesign landing page with Vite-inspired layout ([865cc48](https://github.com/wojtowicz-artur/regpick/commit/865cc48d48fdf50a3040486da6ab024492a68ced))

## [0.2.12](https://github.com/wojtowicz-artur/regpick/compare/v0.2.11...v0.2.12) (2026-02-27)

### Chores

* include config ([ff89151](https://github.com/wojtowicz-artur/regpick/commit/ff89151f932a544a0356082a77fc59887d91ffa3))
* test commit ([5e22ca5](https://github.com/wojtowicz-artur/regpick/commit/5e22ca56f9099ac9a1766542aa6c1b769e683207))
* test commit ([0d274e4](https://github.com/wojtowicz-artur/regpick/commit/0d274e473790dd36f0168ecf92c4cfc86d4416d6))

## [0.2.11](https://github.com/wojtowicz-artur/regpick/compare/v0.2.10...v0.2.11) (2026-02-27)

## [0.2.10](https://github.com/wojtowicz-artur/regpick/compare/v0.2.9...v0.2.10) (2026-02-27)

## [0.2.9](https://github.com/wojtowicz-artur/regpick/compare/v0.2.8...v0.2.9) (2026-02-27)

## [0.2.8](https://github.com/wojtowicz-artur/regpick/compare/v0.2.7...v0.2.8) (2026-02-27)

## [0.2.7](https://github.com/wojtowicz-artur/regpick/compare/v0.2.6...v0.2.7) (2026-02-27)

## [0.2.6](https://github.com/wojtowicz-artur/regpick/compare/v0.2.5...v0.2.6) (2026-02-27)

## [0.2.5](https://github.com/wojtowicz-artur/regpick/compare/v0.2.4...v0.2.5) (2026-02-27)

## [0.2.4](https://github.com/wojtowicz-artur/regpick/compare/v0.2.3...v0.2.4) (2026-02-27)

## [0.2.3](https://github.com/wojtowicz-artur/regpick/compare/v0.2.2...v0.2.3) (2026-02-27)

## [0.2.2](https://github.com/wojtowicz-artur/regpick/compare/v0.2.1...v0.2.2) (2026-02-26)


### Bug Fixes

* refine dry run condition in release workflow ([1973f02](https://github.com/wojtowicz-artur/regpick/commit/1973f022ea3912e6999fe763b8e0c116a4edc177))

## [0.2.1](https://github.com/wojtowicz-artur/regpick/compare/v0.2.0...v0.2.1) (2026-02-26)
