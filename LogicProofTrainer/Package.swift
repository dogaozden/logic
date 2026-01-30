// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LogicProofTrainer",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "LogicProofTrainer", targets: ["LogicProofTrainer"])
    ],
    targets: [
        .executableTarget(
            name: "LogicProofTrainer",
            path: "Sources/LogicProofTrainer"
        ),
        .testTarget(
            name: "LogicProofTrainerTests",
            dependencies: ["LogicProofTrainer"],
            path: "Tests/LogicProofTrainerTests"
        )
    ]
)
