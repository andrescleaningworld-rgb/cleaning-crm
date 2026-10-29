// Why a photo (or a PDF) could not be sent, in the words of crew and sub
// screens: English, Spanish, Portuguese. The reasons come from
// lib/imageResize.ts (preparePhoto / prepareDocOrPhoto); staff screens use
// photoProblemText there (English only).
import type { UploadProblem } from "@/lib/imageResize";

type Lang = "en" | "es" | "pt";

const WORDS: Record<Lang, Record<UploadProblem, string>> = {
  en: {
    heic: 'This phone cannot open this photo type (HEIC). Send it from the iPhone, or on the iPhone: Settings → Camera → Formats → "Most Compatible".',
    unreadable: "Not a photo, or the file is damaged.",
    memory: "The phone ran out of memory. Try again with fewer photos.",
    tooBig: "Too big to send. Try again with fewer photos.",
    pdfTooBig: "This PDF is too big to send (more than 4 MB). Take a photo of it instead.",
  },
  es: {
    heic: 'Este teléfono no puede abrir este tipo de foto (HEIC). Envíala desde el iPhone, o en el iPhone: Ajustes → Cámara → Formatos → "Más compatible".',
    unreadable: "No es una foto, o el archivo está dañado.",
    memory: "Al teléfono le faltó memoria. Intenta de nuevo con menos fotos.",
    tooBig: "Demasiado grande para enviar. Intenta de nuevo con menos fotos.",
    pdfTooBig: "Este PDF es demasiado grande para enviar (más de 4 MB). Tómale una foto.",
  },
  pt: {
    heic: 'Este telefone não consegue abrir este tipo de foto (HEIC). Envie pelo iPhone, ou no iPhone: Ajustes → Câmera → Formatos → "Mais Compatível".',
    unreadable: "Não é uma foto, ou o arquivo está danificado.",
    memory: "O telefone ficou sem memória. Tente de novo com menos fotos.",
    tooBig: "Grande demais para enviar. Tente de novo com menos fotos.",
    pdfTooBig: "Este PDF é grande demais para enviar (mais de 4 MB). Tire uma foto dele.",
  },
};

export function photoProblemWords(lang: string, problem: UploadProblem): string {
  return (WORDS[lang as Lang] ?? WORDS.en)[problem];
}
