
/*      @module doczar:Templates
    Loads and prepares the Marked and Handlebars renderers. Registers a link renderer with Marked
    and a number of helpers with Handlebars. Associates link rendering calls from Marked with the
    [Component](doczar:Component) being rendered.
*/

var path       = require ('path');
var fs         = require ('fs-extra');
var url        = require ('url');
var marked     = require ('marked');
var Handlebars = require ('handlebars');
var highlight  = require ('highlight.js');
var Patterns   = require ('./Patterns');
var Parser     = require ('./Parser');

var logger;
var currentContext;
var currentPath;
var currentLinkContext;

function concatArrs () {
    var out = [];
    for (var i in arguments)
        if (arguments[i])
            out.push.apply (out, arguments[i]);
    return out;
}

var markedRenderer = new marked.Renderer();
var linkFailureSources = {};
markedRenderer.link = function (href, title, text) {
    var targetStr = href || text;

    // pass http and https links through unmodified
    var target = url.parse (targetStr);
    if (target.protocol == 'http:' || target.protocol == 'https:')
        return '<a href="'+href+'">' + ( text || href ) + '</a>'

    // typelink
    var uglySrc = '';
    for (var i=0, j=currentLinkContext.length; i<j; i++) {
        var step = currentLinkContext[i];
        if (step[2])
            uglySrc += '[' + (step[0]||'.') + step[1] + ']';
        else
            uglySrc += (step[0] || '.') + step[1];
    }
    uglySrc = uglySrc.slice (1);

    // is this a loaded document with a local path (like .Foo)
    if (!currentLinkContext && !targetStr[0].match (Patterns.pathWord)) {
        // the only acceptable possibility here is a hash link
        if (targetStr[0] == '#') // such as #more-info
            return '<a href="'+targetStr+'">'+( text||targetStr )+'</a>'
        logger.warn (
            { from:uglySrc, type:targetStr },
            'cannot resolve relative link from @load resource'
        );
        return '<a href="javascript:return false;">'+( text||targetStr )+'</a>'
    }

    if (targetStr == '.')
        type = currentLinkContext;
    else {
        type = Parser.parsePath (targetStr);
        if (type[0] && type[0][0])
            type = concatArrs (currentLinkContext, type);
    }

    var notFound;
    try {
        currentContext.resolve (type);
    } catch (err) {
        if (
            (
                !Object.hasOwnProperty.call (linkFailureSources, uglySrc)
             && ( linkFailureSources[uglySrc] = {} )
            )
         || !Object.hasOwnProperty.call (linkFailureSources[uglySrc], targetStr)
        ) {
            linkFailureSources[uglySrc][targetStr] = true;
            logger.warn ({ from:uglySrc, type:targetStr }, 'cross reference failed');
        }
    }

    return '<a href="'
     + currentContext.getRelativeURLForType (
        currentPath,
        type
     )
     + '"><code>'
     + ( text || uglySrc )
     + '</code></a>'
     ;
};
marked.setOptions ({
    gfm:        true,
    tables:     true,
    renderer:   markedRenderer,
    highlight:  function (code, lang) {
        if (lang)
            return highlight.highlightAuto (code, [ lang ]).value;
        return highlight.highlightAuto (code).value;
    }
});

// load partials
var partialsPath = path.resolve (path.dirname (module.filename), '../templates');
var partials = {};
var pnames = fs.readdirSync (partialsPath);
for (var i in pnames) {
    var currentTemplateName = pnames[i];
    if (currentTemplateName[0] == '.' || currentTemplateName.slice (-5) != '.bars')
        continue;
    Handlebars.registerPartial (
        currentTemplateName.slice (0, -5),
        fs.readFileSync (path.join (partialsPath, currentTemplateName)).toString ('utf8')
    );
}

Handlebars.registerHelper ('markdown', function (doc) {
    var out = '';
    if (!doc) return out;
    for (var i=0, j=doc.length; i<j; i++) {
        var frag = doc[i];
        currentLinkContext = frag.context;
        out += marked (frag.doc);
    }
    return out;
});

Handlebars.registerHelper ('link', function linkHelper (tpath) {
    try {
        currentContext.resolve (tpath);
        var gotPath = currentContext.getRelativeURLForType (
            currentPath,
            tpath
        );
        return gotPath;
    } catch (err) {
        var uglySrc = '';
        for (var i=0, j=currentPath.length; i<j; i++) {
            var step = currentPath[i];
            if (step[2])
                uglySrc += '[' + (step[0]||'.') + step[1] + ']';
            else
                uglySrc += (step[0] || '.') + step[1];
        }
        uglySrc = uglySrc.slice (1);

        var uglyDest = '';
        for (var i=0, j=tpath.length; i<j; i++) {
            var step = tpath[i];
            if (step[2])
                uglyDest += '[' + (step[0]||'.') + step[1] + ']';
            else
                uglyDest += (step[0] || '.') + step[1];
        }
        uglyDest = uglyDest.slice (1);

        if (!Object.hasOwnProperty.call (linkFailureSources, uglySrc))
            linkFailureSources[uglySrc] = {};
        if (!Object.hasOwnProperty.call (linkFailureSources[uglySrc], uglyDest)) {
            linkFailureSources[uglySrc][uglyDest] = true;
            logger.warn ({ from:uglySrc, type:uglyDest }, 'link resolution failed');
        }
    }
    return 'javascript:return false;';
});

Handlebars.registerHelper ('symbolLink', function (tpath) {
    if (!tpath || !tpath.length)
        return '#';
    return currentContext.getRelativeURLForType (
        currentPath,
        tpath[tpath.length-1][2]
    );
});

Handlebars.registerHelper ('trimSymbolName', function (name) {
    return name.slice (1, -1);
});

Handlebars.registerHelper ('getBaseTagPath', function (path) {
    var baseTagPath = '';
    for (var i=path.length-1; i>0; i--)
        baseTagPath += '../../';
    return baseTagPath;
});

Handlebars.registerHelper ('softlink', function (tpath) {
    try {
        var component = currentContext.resolve (tpath);
        return '#' + component.final.elemID;
    } catch (err) {
        // not found
        return 'javascript:return false;'
    }
});

var ComponentTemplate = Handlebars.compile (
    '{{> header}}\n'
  + '{{> children}}\n'
  + '{{> footer}}\n'
);

var RootTemplate = Handlebars.compile (
    fs.readFileSync (
        path.join (
            path.resolve (
                path.dirname (module.filename),
                '../'
            ),
            'templates',
            'root.bars'
        )
    ).toString ('utf8')
);

/*      @property/Function render
    Produce an html rendering of a [Component](doczar:Component).
@argument/doczar:Component component
    The Component to render.
@returns/String
    The rendered html document.
*/
var compy;
function render (component) {
    compy = component;
    logger = component.logger;
    currentContext = component.context;
    currentPath = component.path;
    return ComponentTemplate (component.final);
};

/*      @property/Function renderRoot
    Produce an html rendering of the [Components](doczar:Component) on a [context]
    (doczar:ComponentCache) root.
@argument/Object root
    The cache root to render.
@argument/doczar:ComponentCache context
    The parent [ComponentCache](doczar:ComponentCache) context object.
@returns/String
    The rendered html document.
*/
function renderRoot (root, context, logInst) {
    currentContext = context;
    logger = logInst;
    currentPath = [];

    var modules = [];
    var globals = [];
    for (var key in root)
        if (root[key].ctype == 'module')
            modules.push (root[key].final);
        else
            globals.push (root[key].final);
    function sortItems (a, b) {
        var an = a.pathstr.toLowerCase();
        var bn = b.pathstr.toLowerCase();
        if (an > bn) return 1;
        if (an < bn) return -1;
        return 0;
    }
    modules.sort (sortItems);
    globals.sort (sortItems);

    var now = new Date();
    var timestring = (now.getHours()%12||12)+':'+(now.getMinutes())+(now.getHours()<12?'am':'pm');
    return RootTemplate ({
        modules:        modules,
        globals:        globals,
        date:           now.toLocaleDateString(),
        time:           timestring
    });
};

module.exports = {
    render:         render,
    renderRoot:     renderRoot
};
