(function () {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            }
            const img = entry.target;
            const source = img.getAttribute('data-src');
            if (source) {
                img.src = source;
                img.srcset = `${source} 1x`;
                img.removeAttribute('data-src');
            }
            obs.unobserve(img);
        });
    }, {
        rootMargin: '200px 0px'
    });

    document.querySelectorAll('[data-game-card-img]').forEach(img => {
        if ('loading' in HTMLImageElement.prototype) {
            const source = img.getAttribute('data-src');
            if (source) {
                img.src = source;
                img.srcset = `${source} 1x`;
                img.removeAttribute('data-src');
            }
            return;
        }
        observer.observe(img);
    });
})();