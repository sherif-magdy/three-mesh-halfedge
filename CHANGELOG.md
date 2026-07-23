# Changelog

## [2.4.0](https://github.com/sherif-magdy/three-mesh-halfedge/compare/v2.3.0...v2.4.0) (2026-07-23)


### Features

* **attributes:** carry per-corner attrs through topology edit ops ([bc3ad8c](https://github.com/sherif-magdy/three-mesh-halfedge/commit/bc3ad8c45bb05d03f6ac3881256fd365de6a353e))
* **core:** add n-gon tessellation (ear-clip) with mutation dirty-flag ([eaf7415](https://github.com/sherif-magdy/three-mesh-halfedge/commit/eaf74155ba2e7e7cd69ce03d5571fa37200290d2))
* **core:** add per-corner attribute layers (storage, ingest, clone/copy) ([5524f7c](https://github.com/sherif-magdy/three-mesh-halfedge/commit/5524f7cf2da87a665e695c1365be0be9356054d9))
* **operations:** add dissolve primitives (joinFaces/joinFacesAcrossEdge/dissolveVertex) ([5b901b6](https://github.com/sherif-magdy/three-mesh-halfedge/commit/5b901b60fe30a79159a59285be7509ec1a9acf94))
* **operations:** add limited dissolve by face-normal angle ([16a5f6f](https://github.com/sherif-magdy/three-mesh-halfedge/commit/16a5f6fc0e8e8ce66ce2d98e776bd63cb41158cc))
* **operations:** emit per-corner attributes in toGeometry ([8c1c2e4](https://github.com/sherif-magdy/three-mesh-halfedge/commit/8c1c2e4e5521b008f5a708d336011a2ae9875bca))


### Bug Fixes

* **operations:** dissolve self-sided spikes in limitedDissolve ([ec01183](https://github.com/sherif-magdy/three-mesh-halfedge/commit/ec011832f23469f6eef3dffbea7228d2a03d988c))

## [Unreleased](https://github.com/sherif-magdy/three-mesh-halfedge/compare/v2.3.0...HEAD)


### Features

* **core:** add n-gon tessellation (ear-clip) with mutation dirty-flag ([eaf7415](https://github.com/sherif-magdy/three-mesh-halfedge/commit/eaf74155ba2e7e7cd69ce03d5571fa37200290d2))
* **operations:** add dissolve primitives (joinFaces/joinFacesAcrossEdge/dissolveVertex) ([5b901b6](https://github.com/sherif-magdy/three-mesh-halfedge/commit/5b901b60fe30a79159a59285be7509ec1a9acf94))
* **operations:** add limited dissolve by face-normal angle ([16a5f6f](https://github.com/sherif-magdy/three-mesh-halfedge/commit/16a5f6fc0e8e8ce66ce2d98e776bd63cb41158cc))


### Bug Fixes

* **operations:** dissolve self-sided spikes in limitedDissolve ([ec01183](https://github.com/sherif-magdy/three-mesh-halfedge/commit/ec011832f23469f6eef3dffbea7228d2a03d988c))

## [2.3.0](https://github.com/sherif-magdy/three-mesh-halfedge/compare/v2.2.0...v2.3.0) (2026-07-22)


### Features

* **core:** add n-gon-native ingestion and Newell face normals ([0b6a0f3](https://github.com/sherif-magdy/three-mesh-halfedge/commit/0b6a0f374812a95b9df5673f0c2476156f0fe3a6))

## [2.2.0](https://github.com/sherif-magdy/three-mesh-halfedge/compare/v2.1.0...v2.2.0) (2026-07-20)


### Features

* **core:** add structure-preserving clone()/copy() ([4c2ed07](https://github.com/sherif-magdy/three-mesh-halfedge/commit/4c2ed073f75e82c5728e06b74d1045c7c08909ad))


### Bug Fixes

* **operations:** drain one-ring generator before mutating in removeVertex ([ca5cd36](https://github.com/sherif-magdy/three-mesh-halfedge/commit/ca5cd3660ce1f355a044aef7ef6e72afe2905835))
* **operations:** update both adjacent face loops in splitEdge ([f9bf14c](https://github.com/sherif-magdy/three-mesh-halfedge/commit/f9bf14ceacfca456be6593036af7e310de1b0713))

## [2.1.0](https://github.com/sherif-magdy/three-mesh-halfedge/compare/v2.0.0...v2.1.0) (2026-07-06)


### Features

* **core:** add toGeometry operation to convert halfedge structure back to BufferGeometry ([e150235](https://github.com/sherif-magdy/three-mesh-halfedge/commit/e1502353d961fee22f1cf82d836b5eead82bd53c))


### Bug Fixes

* resolve module-load crash for ESM/Vite/vitest consumers ([163808a](https://github.com/sherif-magdy/three-mesh-halfedge/commit/163808aa7c2512b1d994f64e86780f47d16bedbe))
