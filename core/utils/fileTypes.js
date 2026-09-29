// core/utils/fileTypes.js
// Версия 1.0.0

(function() {
    'use strict';

    var EXT = {
        JS:   '.js',
        JSON: '.json',
        CSS:  '.css',
        HTML: '.html',
        SVG:  '.svg',
        MD:   '.md',
        TXT:  '.txt',
        LSP:  '.lsp',
        LSU:  '.lsu'
    };

    var ASSET_EXTENSIONS = [
        EXT.JS,
        EXT.JSON,
        EXT.CSS,
        EXT.HTML,
        EXT.SVG,
        EXT.MD,
        EXT.TXT,
        EXT.LSP,
        EXT.LSU
    ];

    function getExtension(name) {
        if (name == null) return '';
        var s = String(name);
        var idx = s.lastIndexOf('.');
        if (idx < 0) return '';
        return s.slice(idx).toLowerCase();
    }

    function hasExtension(name, ext) {
        if (!ext) return false;
        return getExtension(name) === String(ext).toLowerCase();
    }

    function isJsFile(name) {
        return getExtension(name) === EXT.JS;
    }

    function isAssetFile(name) {
        var ext = getExtension(name);
        if (!ext) return false;
        for (var i = 0; i < ASSET_EXTENSIONS.length; i++) {
            if (ASSET_EXTENSIONS[i] === ext) return true;
        }
        return false;
    }

    function isDirectoryName(name) {
        if (name == null) return false;
        var s = String(name);
        if (!s) return false;
        if (s.charAt(0) === '.') return false;
        if (s.charAt(0) === '_') return false;
        return !isAssetFile(s);
    }

    var api = {
        EXT: EXT,
        ASSET_EXTENSIONS: ASSET_EXTENSIONS,
        getExtension: getExtension,
        hasExtension: hasExtension,
        isJsFile: isJsFile,
        isAssetFile: isAssetFile,
        isDirectoryName: isDirectoryName
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof window !== 'undefined') {
        window.LsFileTypes = api;
    }

})();