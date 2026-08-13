// Generates a PDF copy of the result screen and saves it locally.
// - Packaged Android app: written to Documents/AbacusDetect/ on the phone
//   (visible in the Files app) via the Capacitor Filesystem plugin.
// - Web browser: downloaded as a regular file download.
// PDF generation is client-side (jsPDF) so it works offline — it never
// depends on the server.

import { jsPDF } from "jspdf";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

export interface ResultPdfData {
  nurseId: string;
  patientId: string;
  value: number;
  units: string;
  resultAt: Date;
  voiceNoteCount: number;
}

interface PdfBand {
  label: string;
  zone: string;
  rgb: [number, number, number];
}

// Same SAA2 5-band thresholds as the result screen.
const bandForValue = (value: number): PdfBand =>
  value < 10
    ? { label: "Very Low", zone: "Zone 5", rgb: [22, 101, 52] }
    : value < 50
    ? { label: "Low", zone: "Zone 4", rgb: [74, 222, 128] }
    : value <= 200
    ? { label: "Moderate", zone: "Zone 3", rgb: [202, 138, 4] }
    : value <= 300
    ? { label: "High", zone: "Zone 2", rgb: [249, 115, 22] }
    : { label: "Very High", zone: "Zone 1", rgb: [239, 68, 68] };

// Same piecewise mapping the on-screen gauge uses (percent along the bar).
const gaugePercent = (s: number): number => {
  if (s < 10) return (s / 10) * 20;
  if (s < 50) return 20 + ((s - 10) / 40) * 20;
  if (s <= 200) return 40 + ((s - 50) / 150) * 20;
  if (s <= 300) return 60 + ((s - 200) / 100) * 20;
  return 80 + Math.min((s - 300) / 300, 1) * 20;
};

const SEGMENT_COLORS: Array<[number, number, number]> = [
  [22, 101, 52], // very low  (dark green)
  [74, 222, 128], // low       (green)
  [250, 204, 21], // moderate  (yellow)
  [249, 115, 22], // high      (orange)
  [239, 68, 68], // very high (red)
];
const SEGMENT_LABELS = ["<10", "<50", "50\u2013200", ">200", ">300"];

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "unknown";

const pad = (n: number) => n.toString().padStart(2, "0");

export const resultPdfFilename = (data: ResultPdfData): string => {
  const d = data.resultAt;
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `SAA2_${sanitize(data.patientId)}_${stamp}.pdf`;
};

export function buildResultPdf(data: ResultPdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 20;
  const right = pageW - 20;
  const width = right - left;
  const band = bandForValue(data.value);
  let y = 24;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text("AbacusDetect \u2014 SAA2 Test Result", left, y);
  y += 4;
  doc.setDrawColor(58, 174, 82);
  doc.setLineWidth(0.8);
  doc.line(left, y, right, y);
  y += 12;

  // Identification block
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT ID", left, y);
  doc.text("NURSE ID", left + width / 2, y);
  y += 6;
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text(data.patientId || "\u2014", left, y);
  doc.text(data.nurseId || "\u2014", left + width / 2, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text("DATE & TIME", left, y);
  y += 6;
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text(
    `${data.resultAt.toLocaleDateString()}  ${data.resultAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    left,
    y,
  );
  y += 14;

  // Result value + band
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text("SAA2 RESULT", left, y);
  y += 9;
  doc.setFontSize(24);
  doc.setTextColor(20, 20, 20);
  doc.text(`${data.value} ${data.units}`, left, y);
  // Band badge
  const badgeText = `${band.label}  (${band.zone})`;
  doc.setFontSize(12);
  const badgeW = doc.getTextWidth(badgeText) + 12;
  doc.setFillColor(...band.rgb);
  doc.roundedRect(right - badgeW, y - 7, badgeW, 10, 5, 5, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeText, right - badgeW + 6, y);
  y += 10;
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "normal");
  doc.text(`Probability of SBI: ${band.label}`, left, y);
  y += 14;

  // Gauge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text("SAA2 RANGE", left, y);
  y += 8;
  const segW = width / 5;
  const barH = 8;
  SEGMENT_COLORS.forEach((rgb, i) => {
    doc.setFillColor(...rgb);
    doc.rect(left + i * segW, y, segW, barH, "F");
  });
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.rect(left, y, width, barH);
  // Marker triangle above the bar at the value position
  const pinX = left + Math.max(2, Math.min(width - 2, (gaugePercent(data.value) / 100) * width));
  doc.setFillColor(55, 65, 81);
  doc.triangle(pinX - 2.5, y - 1.5, pinX + 2.5, y - 1.5, pinX, y + 2, "F");
  y += barH + 5;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  SEGMENT_LABELS.forEach((label, i) => {
    doc.text(`${label} ${data.units}`, left + i * segW + segW / 2, y, { align: "center" });
  });
  y += 12;

  // Notes
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(
    data.voiceNoteCount > 0
      ? `${data.voiceNoteCount} voice note${data.voiceNoteCount === 1 ? "" : "s"} attached to the health record.`
      : "No voice notes attached.",
    left,
    y,
  );
  y += 12;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Generated by AbacusDetect at the point of care. For clinical use in conjunction with professional judgement.",
    left,
    285,
  );

  return doc;
}

/**
 * Saves the PDF locally. Returns a human-readable description of where it
 * went. Throws if saving failed (the caller decides how loud to be — the
 * health-record push itself must never fail because of the local PDF copy).
 */
export async function saveResultPdfLocally(data: ResultPdfData): Promise<string> {
  const doc = buildResultPdf(data);
  const filename = resultPdfFilename(data);

  if (Capacitor.isNativePlatform()) {
    // Ask for storage permission where the OS still requires it (Android ≤ 10);
    // on modern Android, writing app-created files to Documents needs none.
    try {
      const status = await Filesystem.checkPermissions();
      if (status.publicStorage !== "granted") await Filesystem.requestPermissions();
    } catch {
      /* permission API unavailable — attempt the write anyway */
    }
    const base64 = doc.output("datauristring").split(",")[1];
    await Filesystem.writeFile({
      path: `AbacusDetect/${filename}`,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return `Documents/AbacusDetect/${filename}`;
  }

  // Web: regular browser download.
  doc.save(filename);
  return filename;
}
