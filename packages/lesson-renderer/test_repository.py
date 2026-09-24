import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from index_repository import unpack, MAX_FILE
from repository_jobs import parse_refs, listing

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

SHA = 'a' * 40

class BranchTests(unittest.TestCase):
    def test_a_default_github_names_is_known(self):
        default, branches = parse_refs(f'ref: refs/heads/dev\tHEAD\n{SHA}\tHEAD\n{SHA}\trefs/heads/dev\n{SHA}\trefs/heads/alpha\n')
        out = listing('o/r', default, branches, 1)
        self.assertEqual(out['defaultBranch'], 'dev')
        self.assertTrue(out['defaultBranchKnown'])

    def test_no_default_is_reported_not_invented(self):
        default, branches = parse_refs(f'{SHA}\trefs/heads/zeta\n{SHA}\trefs/heads/alpha\n')
        out = listing('o/r', default, branches, 1)
        self.assertFalse(out['defaultBranchKnown'])
        self.assertEqual(out['defaultBranch'], 'alpha')  # kept for RepositoryImport.jsx:14
        self.assertEqual(out['branches'], ['alpha', 'zeta'])

if __name__=='__main__':unittest.main()
