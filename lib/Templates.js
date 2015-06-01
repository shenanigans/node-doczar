
/**     @module doczar.Templates
    @development
    Loads and prepares the Marked and Handlebars renderers. Encapsulates a state mechanism to root
    links to the [Component](doczar.Component) being rendered.
*/

var path = require ('path');
var fs = require ('graceful-fs');
var url = require ('url');
var marked = require ('marked');
var Handlebars = require ('handlebars');
var highlight = require ('highlight.js');
var Patterns = require ('./Patterns');

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
markedRenderer.link = function (href, title, text) {
    var targetStr = href || text;

    var target = url.parse (targetStr);
    if (target.protocol == 'http:' || target.protocol == 'https:')
        return '<a href="'+href+'">' + ( text || href ) + '</a>'

    if (!target.protocol) {
        // is this a loaded document with a local path (like .Foo)
        if (!currentLinkContext && !targetStr[0].match (Patterns.pathWord)) {
            // the only acceptable possibility here is a hash link
            if (targetStr[0] == '#') // such as #more-info
                return '<a href="'+targetStr+'">'+( text||targetStr )+'</a>'
            return '<a href="javascript:return false;">'+( text||targetStr )+'</a>'
        }

        // typelink
        var uglypath = '';
        for (var i in currentLinkContext)
            uglypath += (currentLinkContext[i][0] || '.') + currentLinkContext[i][1];

        if (targetStr == '.')
            type = currentLinkContext;
        else {
            var type = [];
            var typeMatch;
            var offset = 0;
            while (
                offset < targetStr.length
             && (typeMatch = Patterns.word.exec (targetStr.slice (offset)))
            ) {
                offset += typeMatch[0].length;
                type.push ([ typeMatch[1], typeMatch[2] ]);
            }
            if (type[0] && type[0][0])
                type = concatArrs (currentLinkContext, type);
        }

        var notFound;
        try {
            currentContext.resolve (type);
        } catch (err) {
            currentContext.warnings.push ({
                path:       uglypath,
                reference:  targetStr,
                warning:    'failed to create cross-reference'
            });
        }

        return '<a href="'
         + currentContext.getRelativeURLForType (
            currentPath,
            type
         )
         + '"><code>'
         + ( text || uglypath )
         + '</code></a>'
         ;
    }

    return '<a href="'+href+'">' + ( text || href ) + '</a>';
};
marked.setOptions ({
    gfm:        true,
    renderer:   markedRenderer,
    tables:     true,
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
    return currentContext.getRelativeURLForType (
        currentPath,
        tpath
    );
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

/**     @property/Function render
    Produce an html rendering of a [Component's finalization](doczar.Component.Finalization).
@argument/doczar.Component component
    The Component to render.
@returns/String
    The rendered html document.
*/
function render (component) {
    currentContext = component.context;
    currentPath = component.path;
    return ComponentTemplate (component.final);
};

/**     @property/Function renderRoot
    Produce an html rendering of the [Components](doczar.Component) on a [context]
    (doczar.ComponentCache) root.
@argument/Object root
    The cache root to render.
@argument/doczar.ComponentCache context
    The parent [ComponentCache](doczar.ComponentCache) context object.
@returns/String
    The rendered html document.
*/
function renderRoot (root, context) {
    currentContext = context;
    currentPath = [];

    var modules = [];
    var globals = [];
    for (var key in root.property)
        if (root.property[key].ctype == 'module')
            modules.push (root.property[key].final);
        else
            globals.push (root.property[key].final);

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
