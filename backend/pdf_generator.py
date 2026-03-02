from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime
import os

def generate_escrow_agreement_pdf(transaction, output_path):
    """Generate professional escrow agreement PDF"""
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1E5EFF'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1E5EFF'),
        spaceAfter=12,
        spaceBefore=12
    )
    
    # Title
    story.append(Paragraph("TrustTrade Escrow Agreement", title_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Transaction Info
    story.append(Paragraph(f"Transaction ID: {transaction['transaction_id']}", styles['Normal']))
    story.append(Paragraph(f"Date Created: {datetime.fromisoformat(transaction['created_at']).strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Buyer Details
    story.append(Paragraph("Buyer Details", heading_style))
    buyer_data = [
        ['Full Name:', transaction['buyer_name']],
        ['Email:', transaction['buyer_email']]
    ]
    buyer_table = Table(buyer_data, colWidths=[1.5*inch, 4*inch])
    buyer_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(buyer_table)
    story.append(Spacer(1, 0.2*inch))
    
    # Seller Details
    story.append(Paragraph("Seller Details", heading_style))
    seller_data = [
        ['Full Name:', transaction['seller_name']],
        ['Email:', transaction['seller_email']]
    ]
    seller_table = Table(seller_data, colWidths=[1.5*inch, 4*inch])
    seller_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(seller_table)
    story.append(Spacer(1, 0.2*inch))
    
    # Item Details
    story.append(Paragraph("Item Details", heading_style))
    item_data = [
        ['Description:', transaction['item_description']],
    ]
    if transaction.get('item_condition'):
        item_data.append(['Condition:', transaction['item_condition']])
    if transaction.get('known_issues'):
        item_data.append(['Known Issues:', transaction['known_issues']])
    
    item_table = Table(item_data, colWidths=[1.5*inch, 4*inch])
    item_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 0.2*inch))
    
    # Financial Summary
    story.append(Paragraph("Financial Summary", heading_style))
    financial_data = [
        ['Item Price:', f"R {transaction['item_price']:.2f}"],
        ['TrustTrade Fee (2%):', f"R {transaction['trusttrade_fee']:.2f}"],
        ['Total Secure Payment:', f"R {transaction['total']:.2f}"]
    ]
    financial_table = Table(financial_data, colWidths=[1.5*inch, 4*inch])
    financial_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEABOVE', (0, 2), (-1, 2), 2, colors.HexColor('#1E5EFF')),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
        ('TEXTCOLOR', (1, 2), (1, 2), colors.HexColor('#1E5EFF')),
    ]))
    story.append(financial_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Escrow Terms
    story.append(Paragraph("Escrow Terms", heading_style))
    terms = [
        "• TrustTrade acts solely as a neutral escrow facilitator and does not take possession of goods.",
        "• Funds will be held securely until delivery confirmation or dispute resolution.",
        "• If a dispute arises, TrustTrade will review submitted evidence and make a final determination.",
        "• TrustTrade liability is limited to the transaction fee charged.",
        "• Buyer and Seller agree to these terms upon confirmation."
    ]
    for term in terms:
        story.append(Paragraph(term, styles['Normal']))
        story.append(Spacer(1, 0.1*inch))
    
    story.append(Spacer(1, 0.3*inch))
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.grey,
        alignment=TA_CENTER
    )
    story.append(Paragraph("TrustTrade – Secure Peer-to-Peer Escrow Services – South Africa", footer_style))
    
    # Build PDF
    doc.build(story)
    return output_path
