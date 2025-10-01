const { SimplePool } = window.nostrTools; // From CDN

const pool = new SimplePool();
const defaultRelays = ['wss://relay.damus.io', 'wss://nos.lol'];

function normalizeDTag(str) {
    return str.toLowerCase().replace(/[^a-z]/g, '-');
}

function basicAsciidocToHtml(content) {
    // Basic parser: Headings, bold, italic, links, wikilinks, code, quotes, images
    let html = content
        .replace(/^= (.*)$/gm, '<h1>$1</h1>') // = Heading 1
        .replace(/^== (.*)$/gm, '<h2>$1</h2>')
        .replace(/^=== (.*)$/gm, '<h3>$1</h3>')
        .replace(/\*([^*]+)\*/g, '<strong>$1</strong>') // *bold*
        .replace(/_([^_]+)_/g, '<em>$1</em>') // _italic_
        .replace(/`([^`]+)`/g, '<code>$1</code>') // `code`
        .replace(/^----\n([\s\S]*?)\n----$/gm, '<pre><code>$1</code></pre>') // code block
        .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>') // > quote
        .replace(/image::([^[ ]+)\[(.*)\]/g, '<img src="$1" alt="$2">'); // image::url[alt]

    // Wikilinks: [[Target]] or [[target|display]]
    html = html.replace(/\[\[([^\]|]+)\]\]/g, (match, target) => {
        const norm = normalizeDTag(target);
        return `<a href="/wiki/${norm}" onclick="loadArticle('${norm}'); return false;">${target}</a>`;
    });
    html = html.replace(/\[\[([^\|]+)\|([^\]]+)\]\]/g, (match, target, display) => {
        const norm = normalizeDTag(target);
        return `<a href="/wiki/${norm}" onclick="loadArticle('${norm}'); return false;">${display}</a>`;
    });

    // Normal links: http://url[]
    html = html.replace(/http(s)?:\/\/([^\s[]+)\[\]/g, '<a href="http$1://$2">$2</a>');

    // nostr: links (basic, assume nip21 - display as link to event/pubkey)
    html = html.replace(/nostr:(npub|nprofile|note|nevent)(\w+)/g, '<a href="https://nostr.com/$1$2" target="_blank">$1$2</a>');

    // Split into paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    return '<p>' + html + '</p>';
}

async function fetchEvents(filters) {
    return new Promise((resolve) => {
        let events = [];
        const sub = pool.subscribe(defaultRelays, filters, {
            onevent(event) { events.push(event); },
            oneose() { resolve(events); sub.close(); } // Close after end-of-stored-events
        });
        setTimeout(() => { resolve(events); sub.close(); }, 5000); // Timeout fallback
    });
}

async function getReactionCount(eventId) {
    const reactions = await fetchEvents({ kinds: [7], '#e': [eventId] });
    return reactions.filter(r => r.content === '+').length;
}

async function loadArticle(topic) {
    const normalized = normalizeDTag(topic);
    history.pushState({}, '', `/wiki/${normalized}`);

    const container = document.getElementById('article-container');
    container.innerHTML = '<div class="loading">Loading...</div>';
    container.classList.remove('compare-view');

    const filters = { kinds: [30818], '#d': [normalized] };
    let articles = await fetchEvents(filters);

    if (articles.length === 0) {
        container.innerHTML = '<p>No articles found for this topic.</p>';
        return;
    }

    // Fetch reaction counts and sort
    for (let article of articles) {
        article.reactionCount = await getReactionCount(article.id);
    }
    articles.sort((a, b) => b.reactionCount - a.reactionCount);

    // Render top article by default
    renderArticle(articles[0], 'article1');

    // Add compare button
    const compareBtn = document.createElement('button');
    compareBtn.id = 'compare-button';
    compareBtn.textContent = 'Compare';
    compareBtn.onclick = () => showCompareList(articles);
    container.insertBefore(compareBtn, container.firstChild);

    document.getElementById('search-input').value = topic; // Update search bar
}

function renderArticle(event, id) {
    const container = document.getElementById('article-container');
    let articleDiv = document.getElementById(id) || document.createElement('div');
    articleDiv.id = id;
    articleDiv.classList.add('article');

    const titleTag = event.tags.find(t => t[0] === 'title')?.[1] || event.tags.find(t => t[0] === 'd')?.[1] || 'Untitled';
    const htmlContent = basicAsciidocToHtml(event.content);

    articleDiv.innerHTML = `
        <h1>${titleTag}</h1>
        <p><em>By: ${event.pubkey.slice(0, 8)}...</em> (+${event.reactionCount} reactions)</p>
        ${htmlContent}
    `;

    if (!document.getElementById(id)) {
        container.appendChild(articleDiv);
    }
}

function showCompareList(articles) {
    const listDiv = document.getElementById('compare-list');
    listDiv.innerHTML = '<h3>Select Article to Compare</h3><ul></ul>';
    const ul = listDiv.querySelector('ul');

    articles.slice(1).forEach((art, idx) => { // Skip first (already shown)
        const li = document.createElement('li');
        const title = art.tags.find(t => t[0] === 'title')?.[1] || art.tags.find(t => t[0] === 'd')?.[1];
        li.textContent = `${title} by ${art.pubkey.slice(0, 8)}... (+${art.reactionCount})`;
        li.onclick = () => {
            renderArticle(art, 'article2');
            document.getElementById('article-container').classList.add('compare-view');
            listDiv.classList.add('hidden');
        };
        ul.appendChild(li);
    });

    listDiv.classList.remove('hidden');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-button');

    searchBtn.onclick = () => loadArticle(searchInput.value);
    searchInput.onkeydown = (e) => { if (e.key === 'Enter') loadArticle(searchInput.value); };

    // Load from URL if present
    const path = window.location.pathname;
    if (path.startsWith('/wiki/')) {
        loadArticle(path.slice(6));
    }
});

// Close compare list on outside click
document.addEventListener('click', (e) => {
    const list = document.getElementById('compare-list');
    if (!list.contains(e.target) && !e.target.id === 'compare-button') {
        list.classList.add('hidden');
    }
});