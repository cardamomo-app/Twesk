// macOS fallback for icon generation: isolated WebKit, no browser profile or external resources.
import AppKit
import WebKit

struct IconJob: Decodable { let source: String; let output: String; let size: Int }
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let jobs = try JSONDecoder().decode([IconJob].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let configuration = WKWebViewConfiguration()
configuration.websiteDataStore = .nonPersistent()
let iconView = WKWebView(frame: NSRect(x: 0, y: 0, width: 512, height: 512), configuration: configuration)
iconView.setValue(false, forKey: "drawsBackground")
let window = NSWindow(contentRect: iconView.frame, styleMask: [.borderless], backing: .buffered, defer: false)
window.isOpaque = false
window.backgroundColor = .clear
window.contentView = iconView
window.orderBack(nil)

class IconRenderer: NSObject, WKNavigationDelegate {
    var index = 0
    func next() {
        if index == jobs.count { exit(0) }
        let job = jobs[index]
        do {
            let svg = try String(contentsOfFile: job.source, encoding: .utf8)
            window.setContentSize(NSSize(width: job.size, height: job.size))
            iconView.frame = NSRect(x: 0, y: 0, width: job.size, height: job.size)
            iconView.loadHTMLString("<!doctype html><meta charset='utf-8'><style>html,body{margin:0;background:transparent}svg{display:block;width:\(job.size)px;height:\(job.size)px}</style>\(svg)", baseURL: nil)
        } catch { print("Icon source error: \(error)"); exit(1) }
    }
    func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) {
        let job = jobs[index]
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            let snapshot = WKSnapshotConfiguration()
            snapshot.rect = view.bounds
            view.takeSnapshot(with: snapshot) { image, error in
                guard let image = image, let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: job.size, pixelsHigh: job.size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
                    print("Icon snapshot failed: \(String(describing: error))"); exit(1)
                }
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = context
                context.cgContext.clear(CGRect(x: 0, y: 0, width: job.size, height: job.size))
                context.imageInterpolation = .high
                image.draw(in: NSRect(x: 0, y: 0, width: job.size, height: job.size), from: .zero, operation: .copy, fraction: 1)
                NSGraphicsContext.restoreGraphicsState()
                do {
                    guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
                    try png.write(to: URL(fileURLWithPath: job.output))
                    print("Rendered \(URL(fileURLWithPath: job.output).lastPathComponent) (\(job.size)×\(job.size))")
                    self.index += 1
                    self.next()
                } catch { print("Icon write error: \(error)"); exit(1) }
            }
        }
    }
    func webView(_ view: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { print(error); exit(1) }
    func webView(_ view: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { print(error); exit(1) }
}
let renderer = IconRenderer()
iconView.navigationDelegate = renderer
renderer.next()
DispatchQueue.main.asyncAfter(deadline: .now() + 90) { print("Icon rendering timed out"); exit(1) }
application.run()
