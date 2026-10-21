import Capacitor
import UIKit

/// The app's web view, with the plugins that live in this project rather than in a package.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WeightHealthPlugin())
    }
}
