/**
 * Client-Side Export Utilities for Decrypted Backup Payloads (PDF & Text)
 */

export interface DecryptedMessage {
  id?: string;
  senderId?: string;
  senderName?: string;
  content: string;
  createdAt: string | number;
}

/**
 * Generate a beautifully styled, print-optimized document and trigger browser Save as PDF / Print dialog.
 */
export function exportToPDF(backupHash: string, messages: DecryptedMessage[]) {
  const printWindow = window.open("", "_blank", "width=900,height=800");
  if (!printWindow) {
    alert("Please allow popups to generate and download the PDF report.");
    return;
  }

  const decryptedAt = new Date().toLocaleString();
  const shortHash = backupHash.substring(0, 16) + "...";

  const rowsHtml = messages
    .map(
      (msg, idx) => `
      <tr style="border-bottom: 1px solid #334155;">
        <td style="padding: 10px; font-weight: bold; color: #38bdf8; vertical-align: top;">${idx + 1}</td>
        <td style="padding: 10px; font-weight: bold; color: #f8fafc; vertical-align: top;">${escapeHtml(
          msg.senderName || "Anonymous"
        )}</td>
        <td style="padding: 10px; color: #94a3b8; font-size: 11px; white-space: nowrap; vertical-align: top;">${new Date(
          msg.createdAt
        ).toLocaleString()}</td>
        <td style="padding: 10px; color: #e2e8f0; word-break: break-word; vertical-align: top;">${escapeHtml(
          msg.content
        )}</td>
      </tr>
    `
    )
    .join("");

  const docHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>purge-chat Backup Report - ${escapeHtml(backupHash)}</title>
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }
        body {
          font-family: 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace;
          background-color: #090d16;
          color: #f8fafc;
          margin: 0;
          padding: 24px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #38bdf8;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .title {
          font-size: 22px;
          font-weight: bold;
          color: #38bdf8;
          letter-spacing: 1px;
        }
        .subtitle {
          font-size: 11px;
          color: #94a3b8;
          margin-top: 4px;
        }
        .badge {
          background-color: rgba(56, 189, 248, 0.15);
          border: 1px solid #38bdf8;
          color: #38bdf8;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: bold;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        .meta-card {
          background-color: #1e293b;
          border: 1px solid #334155;
          padding: 12px;
          border-radius: 6px;
        }
        .meta-label {
          font-size: 10px;
          color: #94a3b8;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .meta-value {
          font-size: 12px;
          font-weight: bold;
          color: #f8fafc;
          word-break: break-all;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          background-color: #0f172a;
          border: 1px solid #334155;
          border-radius: 6px;
          overflow: hidden;
        }
        th {
          background-color: #1e293b;
          color: #38bdf8;
          text-align: left;
          padding: 10px;
          font-size: 11px;
          border-bottom: 1px solid #334155;
        }
        .footer {
          margin-top: 32px;
          text-align: center;
          font-size: 10px;
          color: #64748b;
          border-top: 1px solid #334155;
          padding-top: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">PURGE-CHAT</div>
          <div class="subtitle">Decrypted Zero-Knowledge Backup Payload Report</div>
        </div>
        <div class="badge">VERIFIED AES-256-GCM</div>
      </div>

      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Backup Hash (SHA-256)</div>
          <div class="meta-value">${escapeHtml(shortHash)}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Decrypted At</div>
          <div class="meta-value">${decryptedAt}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Total Messages</div>
          <div class="meta-value">${messages.length} Messages</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th style="width: 140px;">Sender Alias</th>
            <th style="width: 150px;">Timestamp</th>
            <th>Message Content</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="footer">
        Generated by purge-chat • Zero-Knowledge Ephemeral Messaging Architecture
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(docHtml);
  printWindow.document.close();
}

/**
 * Generate and trigger download of a formatted text transcript file (.txt).
 */
export function exportToText(backupHash: string, messages: DecryptedMessage[]) {
  const decryptedAt = new Date().toLocaleString();
  let textContent = `====================================================\n`;
  textContent += `PURGE-CHAT DECRYPTED BACKUP TRANSCRIPT\n`;
  textContent += `====================================================\n`;
  textContent += `Backup Hash : ${backupHash}\n`;
  textContent += `Decrypted At: ${decryptedAt}\n`;
  textContent += `Messages    : ${messages.length}\n`;
  textContent += `Security    : AES-256-GCM Zero-Knowledge\n`;
  textContent += `====================================================\n\n`;

  messages.forEach((msg, idx) => {
    const timeStr = new Date(msg.createdAt).toLocaleString();
    const sender = msg.senderName || "Anonymous";
    textContent += `[${idx + 1}] [${timeStr}] <${sender}>\n`;
    textContent += `${msg.content}\n\n`;
  });

  const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `purge-chat-backup-${backupHash.substring(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
