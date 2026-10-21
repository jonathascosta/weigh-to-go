import Capacitor
import Foundation
import HealthKit

/// Body mass in Apple Health, read and written for the diary (docs/sprint-3.md, story 5). Every
/// sample this app writes carries a sync identifier per day (`weightogo:<yyyy-mm-dd>`) and a sync
/// version (when it was saved, in ms), so writing a day again replaces its sample and the same day
/// written on another device reconciles. Nothing here leaves the phone except through Health itself.
@objc(WeightHealthPlugin)
public class WeightHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WeightHealthPlugin"
    public let jsName = "WeightHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let kilograms = HKUnit.gramUnit(with: .kilo)
    private var bodyMass: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .bodyMass) }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        return Self.isoFormatter.date(from: text)
    }

    /// Whether this device has Apple Health (not a Mac, not an iPad before iPadOS 17).
    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable() && bodyMass != nil])
    }

    /// Shows the permission sheet for reading and writing body mass, if iOS still shows it. Health
    /// never says whether reading was allowed; resolves whether writing is.
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = bodyMass else {
            call.reject("Apple Health isn't available on this device", "UNAVAILABLE")
            return
        }
        store.requestAuthorization(toShare: [type], read: [type]) { [weak self] _, error in
            if let error {
                call.reject(error.localizedDescription, "AUTHORIZATION", error)
                return
            }
            let status = self?.store.authorizationStatus(for: type)
            call.resolve(["write": status == .sharingAuthorized])
        }
    }

    /// Every body mass sample from `from` (ISO, optional) on, oldest first.
    @objc func read(_ call: CAPPluginCall) {
        guard let type = bodyMass else {
            call.reject("Apple Health isn't available on this device", "UNAVAILABLE")
            return
        }
        let from = date(call.getString("from"))
        let predicate = from.map { HKQuery.predicateForSamples(withStart: $0, end: nil, options: .strictStartDate) }
        let byStart = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let ownBundle = Bundle.main.bundleIdentifier
        let query = HKSampleQuery(
            sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [byStart]
        ) { [kilograms] _, results, error in
            if let error {
                call.reject(error.localizedDescription, "READ", error)
                return
            }
            let samples: [[String: Any]] = (results ?? []).compactMap { result in
                guard let sample = result as? HKQuantitySample else { return nil }
                var item: [String: Any] = [
                    "uuid": sample.uuid.uuidString,
                    "kg": sample.quantity.doubleValue(for: kilograms),
                    "start": Self.isoFormatter.string(from: sample.startDate),
                    "fromThisApp": sample.sourceRevision.source.bundleIdentifier == ownBundle,
                ]
                if let syncId = sample.metadata?[HKMetadataKeySyncIdentifier] as? String {
                    item["syncId"] = syncId
                }
                if let version = sample.metadata?[HKMetadataKeySyncVersion] as? NSNumber {
                    item["syncVersion"] = version.int64Value
                }
                return item
            }
            call.resolve(["samples": samples])
        }
        store.execute(query)
    }

    /// Saves samples `{ kg, start, syncId, syncVersion }`. A sample whose sync identifier is already
    /// in Health with a lower version replaces it; with the same or a higher version, Health keeps
    /// what it has.
    @objc func write(_ call: CAPPluginCall) {
        guard let type = bodyMass else {
            call.reject("Apple Health isn't available on this device", "UNAVAILABLE")
            return
        }
        let items = call.getArray("samples", JSObject.self) ?? []
        var samples: [HKQuantitySample] = []
        for item in items {
            guard
                let kg = item["kg"] as? Double, kg > 0,
                let start = date(item["start"] as? String),
                let syncId = item["syncId"] as? String,
                let version = (item["syncVersion"] as? NSNumber)?.int64Value
            else {
                call.reject("A sample to write is incomplete", "INVALID")
                return
            }
            let metadata: [String: Any] = [
                HKMetadataKeySyncIdentifier: syncId,
                HKMetadataKeySyncVersion: NSNumber(value: version),
                HKMetadataKeyWasUserEntered: true,
            ]
            samples.append(HKQuantitySample(
                type: type,
                quantity: HKQuantity(unit: kilograms, doubleValue: kg),
                start: start,
                end: start,
                metadata: metadata
            ))
        }
        guard !samples.isEmpty else {
            call.resolve()
            return
        }
        store.save(samples) { _, error in
            if let error {
                call.reject(error.localizedDescription, "WRITE", error)
                return
            }
            call.resolve()
        }
    }

    /// Deletes this app's samples with these sync identifiers (Health lets an app delete only what it
    /// wrote). Resolves how many went.
    @objc func remove(_ call: CAPPluginCall) {
        guard let type = bodyMass else {
            call.reject("Apple Health isn't available on this device", "UNAVAILABLE")
            return
        }
        let syncIds = call.getArray("syncIds", String.self) ?? []
        guard !syncIds.isEmpty else {
            call.resolve(["deleted": 0])
            return
        }
        let predicate = HKQuery.predicateForObjects(
            withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: syncIds
        )
        store.deleteObjects(of: type, predicate: predicate) { _, count, error in
            if let error {
                call.reject(error.localizedDescription, "DELETE", error)
                return
            }
            call.resolve(["deleted": count])
        }
    }
}
