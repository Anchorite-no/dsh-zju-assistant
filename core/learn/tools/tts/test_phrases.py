import contextlib
import io
import json
import tempfile
import time
import unittest
from unittest.mock import patch

import numpy as np

import engine
import phrases
import serve


class SpeechGroupsTest(unittest.TestCase):
    def setUp(self):
        # Synthetic references keep tests independent of the developer's private voices.
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.voices = patch.object(engine, 'VOICE_DIR', self.folder.name)
        self.voices.start()
        self.addCleanup(self.voices.stop)
        for index, name in enumerate(('爱弥斯', '咲来')):
            folder = engine.os.path.join(self.folder.name, name)
            engine.os.makedirs(folder)
            engine.save_wav(engine.os.path.join(folder, 'voice.wav'), np.full(100, index + 1, dtype=np.int16))
            with open(engine.os.path.join(folder, 'voice.json'), 'w', encoding='utf-8') as stream:
                json.dump({'lang': 'zh', 'text': '这是参考句。'}, stream)

    def lines(self):
        return [{'key': str(i), 'text': f'这是第{i}条完整的中文句子。', 'lang': 'zh'} for i in range(4)]

    def test_context_boundaries(self):
        for boundary in [{'para': True}, {'break_after': True}, {'scene': 'different'}, {'mood': [0,0,0,0,0,0,0,.4]}]:
            lines = self.lines()
            lines[0].update(boundary)
            self.assertEqual(len(phrases.groups(lines, phrases.settings({}))[0]), 1)
        lines = self.lines()
        lines[1]['lang'] = 'en'
        self.assertEqual([len(g) for g in phrases.groups(lines, phrases.settings({}))], [1,1,2])
        self.assertEqual([len(g) for g in phrases.groups(self.lines(), phrases.settings({}))], [2,2])

    def test_caption_boundary_follows_pause_and_never_edits_pcm(self):
        rate=1000
        pcm=np.r_[np.full(1000,5000),np.zeros(400),np.full(1000,5000)].astype(np.int16)
        before=pcm.copy()
        points,method=phrases.positions(pcm,rate,['第一句话','第二句话'])
        self.assertEqual(method,'pause')
        self.assertAlmostEqual(points[1],1.2,places=2)
        np.testing.assert_array_equal(before,pcm)
        self.assertAlmostEqual(sum(np.diff(points)),len(pcm)/rate)

    def test_no_pause_still_keeps_whole_group_audio(self):
        pcm=np.full(4000,1000,dtype=np.int16)
        points,method=phrases.positions(pcm,1000,['相同句长','相同句长'])
        self.assertEqual((points,method),([0.,2.,4.],'estimated'))

    def test_audio_can_be_asked_for_in_parts(self):
        # a sound that cannot be fetched in parts is not seekable in the browser: it plays from its start wherever it is set
        import threading
        import urllib.request
        from http.server import ThreadingHTTPServer
        with tempfile.TemporaryDirectory() as folder, patch.object(engine, 'CACHE_DIR', folder):
            with open(engine.cached('0123456789abcdef', '.mp3'), 'wb') as f:
                f.write(bytes(range(200)))
            server = ThreadingHTTPServer(('127.0.0.1', 0), serve.Handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                url = f'http://127.0.0.1:{server.server_port}/audio/0123456789abcdef.mp3'
                ask = lambda span: urllib.request.urlopen(urllib.request.Request(url, headers={'Range': span} if span else {}))
                whole = ask(None)
                self.assertEqual((whole.status, whole.headers['Accept-Ranges'], len(whole.read())), (200, 'bytes', 200))
                part = ask('bytes=50-59')
                self.assertEqual((part.status, part.headers['Content-Range'], part.read()), (206, 'bytes 50-59/200', bytes(range(50, 60))))
                self.assertEqual(ask('bytes=190-').read(), bytes(range(190, 200)))
                self.assertEqual(ask('bytes=-5').read(), bytes(range(195, 200)))
            finally:
                server.shutdown()
                server.server_close()

    def test_group_is_read_once_and_kept_per_voice(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(engine,'CACHE_DIR',folder):
            serve.use_voice('爱弥斯')
            serve.ready.set()
            lines=self.lines()[:2]
            calls=[]
            def synth(tts,ref,text,lang,seen=None):
                calls.append((text,ref))
                n=engine.SAMPLE_RATE
                x=np.r_[np.full(n,1000),np.zeros(n//3),np.full(n,1000)].astype(np.int16)
                return n,x
            with patch.object(engine,'speak',side_effect=synth):
                a=serve.speak_group('zh',lines,serve.state['id'])
                b=serve.speak_group('zh',lines,serve.state['id'])
                self.assertEqual(a,b)
                self.assertEqual(len(calls),1)
                self.assertEqual(calls[0][0],''.join(x['text'] for x in lines))
                self.assertEqual(a['0']['fp'],a['1']['fp'])
                self.assertTrue(a['0']['continuous'])
                self.assertFalse(a['1']['continuous'])
                self.assertAlmostEqual(a['1']['offset'],a['0']['seconds'])
                old_id=serve.state['id']
                for x in lines:x['mood']=[0,0,0,0,0,0,0,.5]      # a mood left over from the old page: taken, not used
                self.assertEqual(serve.speak_group('zh',lines)['0']['fp'],a['0']['fp'])
                self.assertEqual(len(calls),1)
                serve.use_voice('咲来')
                self.assertNotEqual(serve.state['id'],old_id)
                with self.assertRaises(ValueError):serve.speak_group('zh',lines,old_id)
                c=serve.speak_group('zh',lines)
                self.assertNotEqual(c['0']['fp'],a['0']['fp'])
                self.assertEqual(len(calls),2)

    def test_what_the_model_is_given(self):
        # pinned readings are for the model used before; this one gets the bare character
        self.assertEqual(engine.MARK.sub(r'\1','让它们<待|DAI1>得浅一些，<行|XING2>不行呢？'),'让它们待得浅一些，行不行呢？')
        self.assertEqual(engine.MARK.sub(r'\1','one <minute|M AY0 . N UW1 T> detail'),'one minute detail')
        with tempfile.TemporaryDirectory() as folder:
            wav=engine.os.path.join(folder,'voice.wav')
            engine.save_wav(wav,np.zeros(100,dtype=np.int16))
            self.assertEqual(engine.reference_text(wav),'')          # no voice.json: cloned from the sound alone
            bare=engine.voice_id(wav)
            with open(engine.os.path.join(folder,'voice.json'),'w',encoding='utf-8') as f:
                json.dump({'lang':'zh','text':' 这是参考句。 '},f,ensure_ascii=False)
            self.assertEqual(engine.reference_text(wav),'这是参考句。')
            self.assertNotEqual(engine.voice_id(wav),bare)           # another sentence, another voice as far as the cache goes
        class Model:
            def generate_voice_clone(self,**k):
                self.asked=k
                return [np.r_[np.zeros(240),np.full(4800,.2),np.zeros(240)].astype(np.float32)],engine.SAMPLE_RATE
        model=Model()
        rate,pcm=engine.speak(model,engine.resolve_voice('爱弥斯'),'<重|CHONG2>新排成完全二叉树。','zh')
        self.assertEqual((rate,pcm.dtype,model.asked['text'],model.asked['language']),(engine.SAMPLE_RATE,np.int16,'重新排成完全二叉树。','Chinese'))
        self.assertTrue(model.asked['ref_text'] and not model.asked['xvec_only'])

    def test_letters_read_the_chinese_way(self):
        # the model reads a lone N the English way, falling at the end of a sentence; the user reads it 恩. Subtitles keep the letter
        zh=lambda s:engine.respelt(s,'zh')
        self.assertEqual(zh('所以 N 个节点再怎么排，高度也有 log 二 N 左右。'),'所以恩个节点再怎么排，高度也有 log 二恩左右。')
        self.assertEqual(zh('高度是 log N，是 log N 加一，n h 等于 n h 减一'),'高度是 log 恩，是 log 恩加一，恩 h 等于恩 h 减一')
        self.assertEqual(zh('N 的量级'),'恩的量级')
        same='NIL、rank、January，R R，叫 L R。前一项的 r 倍'                # letters inside words, and every other letter, stay
        self.assertEqual(zh(same),same)
        # an abbreviation spelt letter by letter that he hears better written as one word
        self.assertEqual(zh('直接问 N 个节点的 A V L 树最高多高，A V L 的单旋'),'直接问恩个节点的 AVL 树最高多高，AVL 的单旋')
        self.assertEqual(engine.respelt('N is a number','en'),'N is a number')
        class Model:
            def generate_voice_clone(self,**k):
                self.asked=k
                return [np.full(4800,.2,dtype=np.float32)],engine.SAMPLE_RATE
        model=Model()
        engine.speak(model,engine.resolve_voice('爱弥斯'),'它的高度是大 O log N。','zh')
        self.assertEqual(model.asked['text'],'它的高度是大 O log 恩。')
        # the cache goes by what the model is given: lines with the letter are read again, the rest are kept
        self.assertEqual(engine.fingerprint('zh','N 个节点','v'),engine.fingerprint('zh','恩个节点','v'))
        self.assertNotEqual(engine.fingerprint('en','N nodes','v'),engine.fingerprint('en','恩 nodes','v'))
        serve.use_voice('爱弥斯')
        self.assertEqual(serve.group_id('zh',[{'text':'N 个节点'}]),serve.group_id('zh',[{'text':'恩个节点'}]))
        self.assertNotEqual(serve.group_id('zh',[{'text':'N 个节点'}]),serve.group_id('zh',[{'text':'M 个节点'}]))


class RoomTest(unittest.TestCase):
    # A made-up machine stands in for Windows: nothing here asks the real one for memory, and no model is loaded.
    # The figures are the ones in the README ("系统提交内存"), rounded to halves so the sums are exact.
    def enter(self, others, limit, top=62.8, grows=0, breaks=None):
        """Go through engine.room where the other programs hold `others` GB of a commit limit now at `limit` GB, which the page
        file can raise to 62.8 and no further; `top` is what the registry says of that (None: it does not say); `grows` is what
        the others take more of while the room is being reserved; `breaks` is an error the loading meets as soon as it starts,
        before the watcher has looked once. -> why it was refused (None: it went in), the machine"""
        import threading
        m = {'others': others, 'limit': limit, 'held': 0, 'most': 0, 'inside': None, 'idle': 0}
        def memory():
            if breaks and threading.current_thread() is not threading.main_thread(): time.sleep(.05)
            free = m['limit'] - m['others'] - m['held']
            m['idle'] += free >= engine.SLACK_GB
            return 30.8, m['limit'], free
        def reserve(gb):
            if m['held'] == 8: m['others'] += grows
            if m['others'] + m['held'] + gb > 62.8: return None
            m['held'] += gb
            m['most'] = max(m['most'], m['held'])
            m['limit'] = max(m['limit'], m['others'] + m['held'])        # the page file grows
            return 1
        def release(block):
            m['held'] -= .5
        why = None
        with patch.object(engine, 'memory', memory), patch.object(engine, 'top_limit', lambda physical: top), \
             patch.object(engine, 'reserve', reserve), patch.object(engine, 'release', release), contextlib.redirect_stdout(io.StringIO()):
            try:
                with engine.room():
                    if breaks: raise breaks
                    while m['most'] and m['idle'] < 2: time.sleep(.001)   # the watcher has given back what it gives back at once
                    m['inside'] = m['held']
            except MemoryError as e:
                why = str(e)
        return why, m

    def test_loads_while_the_page_file_can_still_grow(self):
        why, m = self.enter(41.5, 49.0)                 # 2026-10-04: 7.5 GB free, 4 GB left under the top once 17 are held
        self.assertIsNone(why)
        self.assertEqual((m['most'], m['inside'], m['held']), (17, 8, 0))   # 17 reserved, 9 of them given back as slack, none kept
        why, m = self.enter(40.0, 62.5)                 # 22.5 GB free: nothing to reserve
        self.assertEqual((why, m['most'], m['inside']), (None, 0, 0))

    def test_refuses_at_the_top_without_reserving_anything(self):
        for others, limit in [(45.5, 54.5), (45.0, 47.0),               # 2026-10-14: 17 GB could be had, with under 1 GB left above them. Both crashed
                              (51.5, 55.5), (46.5, 55.5), (47.5, 55.5),  # 2026-10-05: 17 GB could not be had. It used to go to the top to find out
                              (45.0, 62.5)]:                             # 17.5 GB free with the limit at its top: where 2026-10-14 stood once it had reserved
            why, m = self.enter(others, limit)
            self.assertTrue(why, (others, limit))
            self.assertEqual((m['most'], m['inside']), (0, None), (others, limit))
        why, m = self.enter(44.5, 54.5)
        self.assertEqual(why, '别的程序占着 44.5GB 提交内存，降到 42.8GB 以下才能加载，还差 1.7GB。')

    def test_gives_it_all_back_when_the_others_grew_meanwhile(self):
        why, m = self.enter(42.0, 49.5, grows=1.5)
        self.assertEqual((why, m['most'], m['held'], m['inside']), ('别的程序占着 43.5GB 提交内存，降到 42.8GB 以下才能加载，还差 0.7GB。', 17, 0, None))

    def test_says_what_went_wrong_inside(self):
        # the line of accounts printed on the way out must not put an error of its own in front of the one that ended the loading
        with self.assertRaises(FileNotFoundError):
            self.enter(41.5, 49.0, breaks=FileNotFoundError('model.safetensors'))

    def test_as_before_when_the_registry_does_not_say(self):
        why, m = self.enter(45.5, 54.5, top=None)       # a page file left to Windows: only whether 17 GB can be had is asked
        self.assertEqual((why, m['most'], m['held']), (None, 17, 0))

    def test_where_the_page_file_ends(self):
        import winreg
        for files, top in [(['c:\\pagefile.sys 16384 32768'], 62.8), (['c:\\pagefile.sys 16384 32768', 'd:\\pagefile.sys 1024 4096'], 66.8),
                           (['?:\\pagefile.sys'], None), (['c:\\pagefile.sys 0 0'], None), ([], None)]:
            with patch.object(winreg, 'OpenKey'), patch.object(winreg, 'QueryValueEx', return_value=(files, winreg.REG_MULTI_SZ)):
                got = engine.top_limit(30.8)
            self.assertEqual(got, top) if top is None else self.assertAlmostEqual(got, top)
        self.assertIsNone(engine.refusal(41.6, 62.8))
        self.assertTrue(engine.refusal(45.4, 62.8))


if __name__=='__main__':
    unittest.main()
