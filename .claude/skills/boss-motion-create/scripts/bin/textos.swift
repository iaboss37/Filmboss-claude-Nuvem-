// OCR com caixa (Vision do macOS). Uso: textos <imagem1> [imagem2 ...]
// Saída: uma linha JSON por imagem {"img":..., "w":..., "h":..., "textos":[{"t":texto,"c":confiança,"x":..,"y":..,"w":..,"h":..}]}
// x, y, w, h normalizados de 0 a 1 com origem no canto de CIMA à esquerda.
import Foundation
import Vision
import AppKit
for path in CommandLine.arguments.dropFirst() {
    var textos: [[String: Any]] = []
    var W = 0, H = 0
    if let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
        W = cg.width; H = cg.height
        let req = VNRecognizeTextRequest { r, _ in
            for o in (r.results as? [VNRecognizedTextObservation]) ?? [] {
                if let c = o.topCandidates(1).first {
                    let b = o.boundingBox
                    textos.append(["t": c.string, "c": Double(round(c.confidence * 100) / 100),
                                   "x": Double(b.minX), "y": Double(1 - b.maxY), "w": Double(b.width), "h": Double(b.height)])
                }
            }
        }
        req.recognitionLevel = .accurate
        req.recognitionLanguages = ["pt-BR", "en-US"]
        req.usesLanguageCorrection = false
        try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    }
    let d: [String: Any] = ["img": path, "w": W, "h": H, "textos": textos]
    if let j = try? JSONSerialization.data(withJSONObject: d), let s = String(data: j, encoding: .utf8) { print(s) }
}
