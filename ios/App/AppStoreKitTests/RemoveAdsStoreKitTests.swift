import StoreKit
import StoreKitTest
import XCTest

/// Remove ads (docs/sprint-4.md, story 2) against StoreKit's own test environment, with the
/// configuration in `Products.storekit`: the StoreKit 2 calls `@capgo/native-purchases` makes for
/// the app (`Product.products`, `Product.purchase`, `Transaction.currentEntitlements`, verified
/// transactions only), and what the app decides from them (src/platform/purchase-native.ts,
/// `grants`: ours, and not refunded). Run by the iOS workflow on the macOS runner's simulator,
/// hosted in the app; nothing here reaches the App Store.
final class RemoveAdsStoreKitTests: XCTestCase {
    static let removeAds = "net.jonathas.weightogo.removeads"

    private var session: SKTestSession!

    override func setUpWithError() throws {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "Products", withExtension: "storekit"),
            "Products.storekit is in the test bundle")
        session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.askToBuyEnabled = false
        session.clearTransactions()
    }

    override func tearDown() {
        session?.clearTransactions()
        session = nil
        super.tearDown()
    }

    /// Remove ads, as the plugin's `getProducts` asks for it.
    private func product() async throws -> Product {
        let products = try await Product.products(for: [Self.removeAds])
        return try XCTUnwrap(products.first { $0.id == Self.removeAds }, "the product is found")
    }

    /// What `getPurchases({ onlyCurrentEntitlements: true })` and `grants` decide.
    private func held() async -> Bool {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == Self.removeAds && transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }

    /// StoreKit delivers some changes (an approval, a refund) a moment later: waits up to `timeout`.
    private func held(becomes expected: Bool, timeout: TimeInterval = 15) async -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if await held() == expected { return true }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return await held() == expected
    }

    /// Buys it as the plugin does (one, verified), and finishes the transaction.
    private func buy() async throws -> Transaction {
        let result = try await product().purchase(options: [.quantity(1)])
        guard case .success(.verified(let transaction)) = result else {
            XCTFail("expected a verified purchase, got \(result)")
            throw CancellationError()
        }
        await transaction.finish()
        return transaction
    }

    /// The Ask to Buy transaction waiting for the parent, from the test session.
    private func waitingForApproval() throws -> SKTestTransaction {
        try XCTUnwrap(
            session.allTransactions().first {
                $0.productIdentifier == Self.removeAds && $0.pendingAskToBuyConfirmation
            }, "a transaction waits for approval")
    }

    func testTheProductIsFoundWithItsPrice() async throws {
        let product = try await product()
        XCTAssertEqual(product.type, .nonConsumable)
        XCTAssertEqual(product.price, Decimal(string: "2.99"))
        XCTAssertFalse(product.displayPrice.isEmpty)
        XCTAssertTrue(product.displayPrice.contains("2"), product.displayPrice)
        XCTAssertTrue(product.isFamilyShareable)
    }

    func testABuyIsVerifiedAndHeldInTheCurrentEntitlements() async throws {
        let before = await held()
        XCTAssertFalse(before, "nothing is held before the purchase")
        let transaction = try await buy()
        XCTAssertEqual(transaction.productID, Self.removeAds)
        XCTAssertEqual(transaction.productType, .nonConsumable)
        XCTAssertNil(transaction.revocationDate)
        let after = await held(becomes: true)
        XCTAssertTrue(after, "the current entitlements hold Remove ads")
    }

    func testARefundRevokesIt() async throws {
        let transaction = try await buy()
        let bought = await held(becomes: true)
        XCTAssertTrue(bought)
        try session.refundTransaction(identifier: UInt(transaction.id))
        let refunded = await held(becomes: false)
        XCTAssertTrue(refunded, "a refunded purchase is no longer held")
    }

    func testAskToBuyIsPendingThenApproved() async throws {
        session.askToBuyEnabled = true
        let result = try await product().purchase(options: [.quantity(1)])
        guard case .pending = result else { return XCTFail("expected pending, got \(result)") }
        let waiting = await held()
        XCTAssertFalse(waiting, "nothing is held while waiting for approval")
        try session.approveAskToBuyTransaction(identifier: try waitingForApproval().identifier)
        let approved = await held(becomes: true)
        XCTAssertTrue(approved, "the approval makes it held")
    }

    func testAskToBuyIsPendingThenDeclined() async throws {
        session.askToBuyEnabled = true
        let result = try await product().purchase(options: [.quantity(1)])
        guard case .pending = result else { return XCTFail("expected pending, got \(result)") }
        try session.declineAskToBuyTransaction(identifier: try waitingForApproval().identifier)
        // Declined: it never becomes held.
        let declined = await held(becomes: true, timeout: 3)
        XCTAssertFalse(declined, "a declined request is never held")
    }
}
