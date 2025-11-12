(function () {
    const supportLazy = 'loading' in HTMLImageElement.prototype;

    const observer = !supportLazy
        ? new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    return;
                }
                hydrateImage(entry.target);
                obs.unobserve(entry.target);
            });
        }, { rootMargin: '200px 0px' })
        : null;

    function hydrateImage(img) {
        if (!img || img.dataset.processed === 'true') {
            return;
        }

        const source = img.getAttribute('data-src');
        const sourceSet = img.getAttribute('data-srcset');
        if (source) {
            img.src = source;
            img.removeAttribute('data-src');
        }
        if (sourceSet) {
            img.srcset = sourceSet;
            img.removeAttribute('data-srcset');
        } else if (source && !img.srcset) {
            img.srcset = `${source} 1x`;
        }
        img.dataset.processed = 'true';
    }

    function scanImages(images) {
        const nodes = images || document.querySelectorAll('[data-game-card-img]');
        nodes.forEach(img => {
            if (supportLazy) {
                hydrateImage(img);
            } else if (observer) {
                observer.observe(img);
            }
        });
    }

    window.playgridRefreshGameCardImages = function (images) {
        if (images instanceof NodeList || Array.isArray(images)) {
            scanImages(images);
        } else if (images) {
            scanImages([images]);
        } else {
            scanImages();
        }
    };

    scanImages();
})();