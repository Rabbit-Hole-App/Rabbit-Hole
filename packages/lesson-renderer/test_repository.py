import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from index_repository import unpack, MAX_FILE

def archive(items):
    result=io.BytesIO()
    with zipfile.ZipFile(result,'w') as output:
        for name,content in items:
            entry=zipfile.ZipInfo('placeholder');entry.filename=name
            output.writestr(entry,content)
    return result.getvalue()

class RepositoryTests(unittest.TestCase):
    def test_reads_text_without_running_source(self):
        with tempfile.TemporaryDirectory() as root:
            files,skipped=unpack(archive([('repo/a.py','raise Exception("must never run")'),('repo/README.md','Hello'),('repo/photo.png',b'abc'),('repo/.env','SECRET=notindexed')]),Path(root))
            self.assertEqual(len(files),2);self.assertEqual(len(skipped),2)
            self.assertIn('raise Exception',files['a.py'])
    def test_rejects_archive_traversal_and_duplicates(self):
        for entries in [[('repo/../../outside.py','x')],[('/absolute.py','x')],[('repo\\x.py','x')],[('repo/a.py','a'),('repo/a.py','b')]]:
            with self.subTest(entries=entries),tempfile.TemporaryDirectory() as root,self.assertRaises(ValueError):unpack(archive(entries),Path(root))
    def test_oversized_and_binary_files_are_reported(self):
        with tempfile.TemporaryDirectory() as root:
            files,skipped=unpack(archive([('repo/a.py','a'*(MAX_FILE+1)),('repo/b.txt',b'\x00')]),Path(root))
            self.assertFalse(files);self.assertEqual(len(skipped),2)

if __name__=='__main__':unittest.main()
