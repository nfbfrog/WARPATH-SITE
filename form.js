// Warpath Collective lead form: drag-and-drop attachments + submit.
// Files are read client-side to base64 and sent in the JSON payload; the
// API attaches them to the lead email. Total cap stays under Vercel's
// request limit; anything larger goes through the links field instead.
(function () {
  var form = document.getElementById('signup');
  if (!form) return;

  var dropzone = document.getElementById('dropzone');
  var input = document.getElementById('f-files');
  var list = document.getElementById('dzList');
  var msg = document.getElementById('formMsg');

  var files = [];
  var MAX_FILES = 5;
  var MAX_TOTAL = 3 * 1024 * 1024; // 3 MB total
  var ALLOWED = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif',
    'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'rtf', 'zip',
    'svg', 'psd', 'ai'];

  function ext(name) { var p = name.split('.'); return p.length > 1 ? p.pop().toLowerCase() : ''; }
  function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
  function total() { return files.reduce(function (s, f) { return s + f.size; }, 0); }
  function setMsg(text, cls) { if (!msg) return; msg.className = 'form-msg' + (cls ? (' ' + cls) : ''); msg.textContent = text; }

  function addFiles(fileList) {
    var incoming = Array.prototype.slice.call(fileList);
    for (var i = 0; i < incoming.length; i++) {
      var file = incoming[i];
      if (files.length >= MAX_FILES) { setMsg('Up to ' + MAX_FILES + ' files.', 'err'); break; }
      if (ALLOWED.indexOf(ext(file.name)) === -1) { setMsg(file.name + ' — that file type is not supported.', 'err'); continue; }
      if (total() + file.size > MAX_TOTAL) { setMsg('Files exceed 3 MB total — paste a link for anything larger.', 'err'); continue; }
      var dup = files.some(function (f) { return f.name === file.name && f.size === file.size; });
      if (dup) continue;
      files.push(file);
    }
    render();
  }

  function render() {
    if (!list) return;
    list.innerHTML = '';
    files.forEach(function (file, idx) {
      var li = document.createElement('li');
      var name = document.createElement('span'); name.className = 'dz-name'; name.textContent = file.name;
      var size = document.createElement('span'); size.className = 'dz-size'; size.textContent = fmtSize(file.size);
      var rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'dz-remove'; rm.setAttribute('aria-label', 'Remove ' + file.name);
      rm.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';
      rm.addEventListener('click', function () { files.splice(idx, 1); render(); });
      li.appendChild(name); li.appendChild(size); li.appendChild(rm);
      list.appendChild(li);
    });
  }

  if (dropzone) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    dropzone.addEventListener('click', function () { if (input) input.click(); });
  }
  if (input) { input.addEventListener('change', function () { addFiles(input.files); input.value = ''; }); }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); var c = s.indexOf(','); resolve({ filename: file.name, content: c >= 0 ? s.slice(c + 1) : s }); };
      r.onerror = function () { reject(new Error('read failed')); };
      r.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setMsg('Sending…', '');
    var fd = new FormData(form);
    Promise.all(files.map(readFile)).then(function (attachments) {
      var payload = {
        name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), business: fd.get('business'),
        message: fd.get('message'), projectType: fd.get('projectType'),
        timeline: fd.get('timeline'), links: fd.get('links'),
        smsConsent: fd.get('smsConsent') === 'yes' ? 'yes' : '',
        botcheck: fd.get('botcheck'), attachments: attachments
      };
      return fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.success) { form.reset(); files = []; render(); setMsg("You're on the Warpath. We'll be in touch within a day.", 'ok'); }
      else { setMsg('Something went wrong — try again in a moment.', 'err'); }
    }).catch(function () { setMsg('Something went wrong — try again in a moment.', 'err'); });
  });
})();
