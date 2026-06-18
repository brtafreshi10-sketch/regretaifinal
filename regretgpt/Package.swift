// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "regretgpt",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .executable(name: "regretgpt", targets: ["regretgpt"])
    ],
    targets: [
        .executableTarget(
            name: "regretgpt",
            path: "regretgpt",
            resources: [
                .process("Assets.xcassets")
            ]
        )
    ]
)
