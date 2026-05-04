const markdownIt = require('markdown-it');

const LINEBREAK_PLACEHOLDER = '---linebreak-placeholder---';

module.exports = eleventyConfig => {
  process.env.TZ = 'UTC';
  eleventyConfig.addPlugin(require("@11ty/eleventy-plugin-syntaxhighlight"));

  eleventyConfig.addPassthroughCopy('asf.md');
  eleventyConfig.addPassthroughCopy('static');

  eleventyConfig.setLiquidOptions({
    jekyllInclude: true,
  });

  // use e.g. /learn.html in preference to /learn/
  eleventyConfig.addGlobalData('permalink', '/{{ page.filePathStem }}.html');

  eleventyConfig.addCollection('guides', collectionApi => {
    return collectionApi.getFilteredByTag('guides').sort((a, b) => a.data.index - b.data.index);
  });

  eleventyConfig.addCollection('pages', collectionApi => {
    // zero-indexed, but skip page 1, as it's served at /blog/
    const pageCount = Math.ceil(collectionApi.getFilteredByTag('posts').length / 5) - 1;
    const blogPages = Array.from(
      { length:pageCount },
      (_, n) => ({
        url: `/blog/page${n+2}/`,
      }),
    );

    return [
      ...collectionApi.getAll().filter(item => !item.data.tags),
      ...blogPages,
    ];
  });

  eleventyConfig.addCollection('posts', collectionApi => {
    return collectionApi
        .getFilteredByTag('posts')
        .sort((a, b) => b.date - a.date || b.inputPath.localeCompare(a.inputPath));
  });

  eleventyConfig.addFilter('first_paragraph', function(content) {
    const marker = '</p>';
    const idx = content.indexOf(marker);
    if(idx === -1) return content;
    return content.substring(0, idx + marker.length);
  });

  eleventyConfig.addFilter('liquid', function(content) {
    if(!this.liquid) return content;

    return this.liquid.parseAndRender(content, this.context);
  });

  const md = markdownIt({
    html: true,
  });

  eleventyConfig.addFilter('inlinemarkdown', content => md.renderInline(content));
  // Re-defined markdown-it lib to prevent eleventy messing with internals.
  // See: https://github.com/11ty/eleventy/issues/2438
  eleventyConfig.setLibrary('md', md);
  eleventyConfig.addFilter('markdown',  content => md.render(content));
  eleventyConfig.addPairedShortcode('markdown',  content => md.render(content));

  eleventyConfig.addTransform('revert-linebreak-markers', function(content) {
    console.log('revert-linebreak-markers', this.outputPath);
    if(!this.outputPath?.endsWith('.html')) return content;
    return content.replaceAll(new RegExp(`^${LINEBREAK_PLACEHOLDER}$`, 'gm'), '');
  });

  return {
    dir: {
      includes: '_includes',
      layouts: '_layouts',
    },
  };
};
