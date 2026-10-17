# Makes the real Office fixtures with Microsoft Word and PowerPoint (Windows, Office installed):
#   fixtures/sample.doc     Word 97-2003 binary: heading, paragraphs, list, table, two pages
#   fixtures/sample.docx    the same document as DOCX
#   fixtures/sample.pptx    3 slides: title, bullets + speaker notes, a hidden third slide
#   fixtures/deck-40.pptx   40 slides (the slow fixture for the busy / kill proofs)
#   powershell -ExecutionPolicy Bypass -File packages/file-convert/proof/make-office-fixtures.ps1
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'fixtures'
New-Item -ItemType Directory -Force $out | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Add()
  $sel = $word.Selection
  $sel.Style = $doc.Styles.Item(-2)   # Heading 1
  $sel.TypeText('Converter fixture: field notes')
  $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item(-1)   # Normal
  $sel.TypeText('This legacy Word document checks the DOC to PDF path. It has a heading, paragraphs, a list, a table and a second page.')
  $sel.TypeParagraph()
  $sel.Range.ListFormat.ApplyBulletDefault()
  foreach ($t in 'First bullet', 'Second bullet', 'Third bullet') { $sel.TypeText($t); $sel.TypeParagraph() }
  $sel.Range.ListFormat.RemoveNumbers()
  $table = $doc.Tables.Add($sel.Range, 3, 2)
  $cells = @('Sample', 'Value', 'alpha', '0042', 'beta', '3.14')
  for ($i = 0; $i -lt 6; $i++) { $table.Cell([math]::Floor($i / 2) + 1, ($i % 2) + 1).Range.Text = $cells[$i] }
  $sel.EndKey(6) | Out-Null
  $sel.InsertBreak(7)                 # page break
  $sel.TypeText('Second page text: the converter must keep page numbers.')
  $doc.SaveAs2([ref](Join-Path $out 'sample.doc'), [ref]0)    # wdFormatDocument (Word 97-2003)
  $doc.SaveAs2([ref](Join-Path $out 'sample.docx'), [ref]16)  # wdFormatDocumentDefault
  $doc.Close([ref]0)
} finally { $word.Quit() }

$pp = New-Object -ComObject PowerPoint.Application
try {
  $pres = $pp.Presentations.Add(0)
  $s1 = $pres.Slides.Add(1, 1)        # ppLayoutTitle
  $s1.Shapes.Item(1).TextFrame.TextRange.Text = 'Converter fixture deck'
  $s1.Shapes.Item(2).TextFrame.TextRange.Text = 'Slide one subtitle'
  $s2 = $pres.Slides.Add(2, 2)        # ppLayoutText
  $s2.Shapes.Item(1).TextFrame.TextRange.Text = 'Second slide'
  $s2.Shapes.Item(2).TextFrame.TextRange.Text = "Bullet A`rBullet B"
  $s2.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Speaker notes for slide two'
  $s3 = $pres.Slides.Add(3, 2)
  $s3.Shapes.Item(1).TextFrame.TextRange.Text = 'Hidden third slide'
  $s3.Shapes.Item(2).TextFrame.TextRange.Text = 'Only in the file, not in the show'
  $s3.SlideShowTransition.Hidden = -1
  $pres.SaveAs((Join-Path $out 'sample.pptx'), 24)   # ppSaveAsOpenXMLPresentation
  $pres.Close()

  $deck = $pp.Presentations.Add(0)
  for ($i = 1; $i -le 40; $i++) {
    $s = $deck.Slides.Add($i, 2)
    $s.Shapes.Item(1).TextFrame.TextRange.Text = "Slide $i of 40"
    $s.Shapes.Item(2).TextFrame.TextRange.Text = "Point one on slide $i`rPoint two on slide $i`rPoint three on slide $i"
  }
  $deck.SaveAs((Join-Path $out 'deck-40.pptx'), 24)
  $deck.Close()
} finally { $pp.Quit() }
Get-ChildItem $out | Select-Object Name, Length
