import { formatDateTime } from './formatters';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }

export function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}


async function loadCompanyLogo() {
  const response = await fetch('/brandsphere-wordmark.png');
  if (!response.ok) throw new Error('The company logo could not be loaded.');
  const blob = await response.blob();
  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 850;
    canvas.height = Math.round(850 * image.height / image.width);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function fileSlug(value) {
  return String(value || 'report').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s-]+/g, '-').toLowerCase().slice(0, 70) || 'report';
}

function printableDate(value) {
  if (!value) return '';
  const timestamp = typeof value === 'object'
    ? (typeof value.toDate === 'function' ? value.toDate() : (value.seconds ?? value._seconds) * 1000)
    : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

export async function exportPdf(title, headers, rows, options = {}) {
  try {
    const logo = await loadCompanyLogo();
    const wide = headers.length >= 7;
    const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const reportDate = formatDateTime(new Date());
    const subtitleLines = options.subtitle ? doc.splitTextToSize(String(options.subtitle), pageWidth - margin * 2) : [];
    const startY = 51 + Math.max(0, subtitleLines.length - 1) * 4;
    const drawHeader = () => {
      doc.addImage(logo, 'JPEG', margin, 8, 53, 20);
      doc.setTextColor(30, 58, 95);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('BRANDSPHERE MARKETING AGENCY', pageWidth - margin, 14, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(102, 119, 143);
      doc.text('MANAGEMENT REPORT', pageWidth - margin, 19, { align: 'right' });
      doc.setDrawColor(67, 105, 177);
      doc.setLineWidth(0.7);
      doc.line(margin, 31, pageWidth - margin, 31);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(25, 43, 69);
      doc.text(String(title || 'Report'), margin, 40, { maxWidth: pageWidth - margin * 2 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(103, 119, 141);
      doc.text(`Generated ${reportDate}`, margin, 45);
      if (subtitleLines.length) doc.text(subtitleLines, margin, 50);
    };
    autoTable(doc, {
      head: [headers.map((cell) => String(cell ?? ''))],
      body: rows.length ? rows.map((row) => row.map((cell) => String(cell ?? ''))) : [['No records to display.']],
      startY,
      margin: { top: startY, right: margin, bottom: 18, left: margin },
      styles: { font: 'helvetica', fontSize: wide ? 7 : 8, cellPadding: 2.5, overflow: 'linebreak', textColor: [48, 67, 94], lineColor: [222, 231, 241], lineWidth: 0.15 },
      headStyles: { fillColor: [232, 239, 249], textColor: [38, 67, 102], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      didDrawPage: (data) => {
        drawHeader();
        doc.setDrawColor(222, 231, 241);
        doc.setLineWidth(0.25);
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(118, 132, 153);
        doc.text('Confidential management report', margin, pageHeight - 8);
        doc.text(`Page ${data.pageNumber}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
      },
    });
    const filename = options.filename || `brandsphere-${fileSlug(title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    return true;
  } catch (error) {
    window.alert(error?.message || 'Could not create the PDF. Please try again.');
    return false;
  }
}

export async function exportApplicantPaperForm(campaign) {
  try {
    const logo = await loadCompanyLogo();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const campaignDates = [printableDate(campaign.startsAt), campaign.endsAt ? printableDate(campaign.endsAt) : 'Ongoing'].filter(Boolean).join(' – ');
    let y = 10;

    const line = (value = y) => {
      doc.setDrawColor(203, 215, 225);
      doc.setLineWidth(.25);
      doc.line(margin, value, pageWidth - margin, value);
    };
    const section = (title) => {
      y += 7;
      doc.setFillColor(235, 243, 247);
      doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(37, 66, 85);
      doc.text(title.toUpperCase(), margin + 3, y + 4.7);
      y += 11;
    };
    const field = (label, width, height = 12) => {
      doc.setDrawColor(185, 199, 210);
      doc.roundedRect(margin + field.x, y, width, height, 1.5, 1.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(76, 99, 113);
      doc.text(label, margin + field.x + 2.5, y + 4);
      field.x += width + 4;
    };
    const check = (label, x) => {
      doc.setDrawColor(122, 140, 151);
      doc.rect(x, y - 3.5, 3.2, 3.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(58, 78, 91);
      doc.text(label, x + 5, y - .8);
    };

    doc.addImage(logo, 'JPEG', margin, y, 49, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 95);
    doc.text('BRANDSPHERE MARKETING AGENCY', pageWidth - margin, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(102, 119, 143);
    doc.text('CONFIDENTIAL RECRUITER FORM', pageWidth - margin, y + 10, { align: 'right' });
    y += 24;
    line();
    y += 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(25, 43, 69);
    doc.text('Applicant registration form', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(91, 111, 126);
    doc.text(`Campaign: ${campaign.name || 'Recruitment campaign'}`, margin, y);
    if (campaign.clientName) doc.text(`Client: ${campaign.clientName}`, margin, y + 4.5);
    doc.text(`Campaign period: ${campaignDates || 'Ongoing'}`, pageWidth - margin, y, { align: 'right' });
    doc.text(`Paper form no.: ____________________`, pageWidth - margin, y + 4.5, { align: 'right' });
    y += 10;

    section('Applicant details');
    field.x = 0; field('Full legal name', 86); field('National ID number', contentWidth - 90); y += 16;
    field.x = 0; field('Phone number', 86); field('Email address', contentWidth - 90); y += 16;
    field.x = 0; field('County of residence', 86); field('Date recorded', contentWidth - 90); y += 14;

    section('Eligibility details');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(76, 99, 113);
    doc.text('Highest education completed (tick one)', margin, y);
    y += 6;
    check('KCPE', margin); check('KCSE', margin + 31); check('Certificate', margin + 61); check('Diploma', margin + 101); check('Degree', margin + 136); check('Postgraduate', margin + 168);
    y += 10;
    check('Other higher qualification', margin); doc.setDrawColor(122, 140, 151); doc.line(margin + 49, y - .8, pageWidth - margin, y - .8);
    y += 11;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(76, 99, 113);
    doc.text('Passport readiness (tick one)', margin, y);
    y += 6;
    check('I have a passport', margin); check('I will get one myself', margin + 52); check('I am not ready yet', margin + 116);
    y += 11;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(76, 99, 113);
    doc.text('NITA fee status (tick one)', margin, y);
    y += 6;
    check('Not paid', margin); check('Paid', margin + 42);
    y += 7;

    section('Consent and recruiter record');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(58, 78, 91);
    const consent = 'I confirm that I am an adult woman and consent to Brandsphere collecting and using my ID, contact, education, and campaign details to assess and contact me about this recruitment opportunity.';
    const consentLines = doc.splitTextToSize(consent, contentWidth - 7);
    doc.rect(margin, y - 3.5, 3.2, 3.2);
    doc.text(consentLines, margin + 5, y - .8);
    y += consentLines.length * 3.5 + 5;
    field.x = 0; field('Applicant signature', 86); field('Recruiter name', contentWidth - 90); y += 16;
    field.x = 0; field('Recruiter signature', 86); field('Date entered in app', contentWidth - 90); y += 17;
    line(y);
    y += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(53, 87, 75);
    doc.text('Handling instructions', margin, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(91, 111, 126);
    const instructions = 'Enter this form in the recruiter app as soon as you have connectivity. Keep paper forms secure, share them only with authorised recruitment staff, and destroy them in line with your organisation’s retention policy after successful entry.';
    doc.text(doc.splitTextToSize(instructions, contentWidth), margin, y + 4);
    doc.setFontSize(6.5); doc.setTextColor(118, 132, 153);
    doc.text(`Generated ${new Date().toLocaleDateString()} · Campaign ID: ${campaign.id || '—'}`, margin, pageHeight - 9);
    doc.save(`brandsphere-applicant-form-${fileSlug(campaign.name)}.pdf`);
    return true;
  } catch (error) {
    window.alert(error?.message || 'Could not create the applicant form PDF. Please try again.');
    return false;
  }
}
