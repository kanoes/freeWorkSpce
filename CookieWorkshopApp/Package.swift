// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "CookieWorkshopApp",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "CookieWorkshopApp",
            targets: ["CookieWorkshopApp"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.24.0"),
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0")
    ],
    targets: [
        .target(
            name: "CookieWorkshopApp",
            dependencies: [
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "Supabase", package: "supabase-swift")
            ],
            path: ".",
            exclude: ["Tests", "Package.swift"],
            sources: [
                "App",
                "Application",
                "Domain",
                "Infrastructure",
                "Presentation"
            ]
        ),
        .testTarget(
            name: "CookieWorkshopAppTests",
            dependencies: ["CookieWorkshopApp"],
            path: "Tests"
        )
    ]
)

