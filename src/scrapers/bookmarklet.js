javascript:(function() {
    // Helper function to download text as a file
    function downloadText(filename, text) {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    // Helper function to format the timestamp from data-time
    function formatTimestamp(dataTime) {
        const date = new Date(parseInt(dataTime)); // Convert data-time attribute to a Date object
        return date.toLocaleString();              // Format the date as a readable string
    }

    // Function to extract and format content with specific handling for links, code blocks, and images
    function extractContent(element) {
        let content = '';

        // Walk through child nodes
        element.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                // Plain text
                content += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'A') {
                    // Handle links
                    let linkText = node.textContent;
                    let linkHref = node.href;
                    content += `${linkText} (${linkHref})`;
                } else if (node.tagName === 'PRE' && node.querySelector('code')) {
                    // Handle code blocks
                    let codeText = node.querySelector('code').textContent;
                    content += `\n\`\`\`\n${codeText}\n\`\`\`\n`;
                } else if (node.tagName === 'IMG') {
                    // Handle images
                    let altText = node.alt || 'Image';
                    let src = node.src;
                    content += `![${altText}](${src})`;
                } else {
                    // Recursively extract content from other elements
                    content += extractContent(node);
                }
            }
        });

        return content;
    }

    // Extract the title of the discussion topic
    const title = document.querySelector('.fancy-title') ? document.querySelector('.fancy-title').innerText : 'No Title Found';

    // Extract all posts from the discussion
    const posts = document.querySelectorAll('.topic-post article');  // This targets each post
    let extractedText = `=== BEGINNING OF TOPIC ===\nTitle: ${title}\n\n`;

    // Loop through each post and gather information (author, date, and post content)
    posts.forEach(post => {
        let author = post.querySelector('.names .username') ? post.querySelector('.names .username').innerText.trim() : 'Unknown Author'; // Username of poster
        let dateElement = post.querySelector('.relative-date');
        let date = dateElement ? formatTimestamp(dateElement.getAttribute('data-time')) : 'Unknown Date'; // Use data-time attribute for timestamp
        let contentElement = post.querySelector('.cooked');
        let content = contentElement ? extractContent(contentElement).trim() : 'No content';  // Use custom extraction for links, images, etc.

        // Format the extracted data
        extractedText += `Author: ${author}\nDate: ${date}\n\n${content}\n\n`;
        extractedText += '=== END OF POST ===\n\n';  // Discernible ASCII break after each post
    });

    // Add an ending ASCII break for the whole topic with a more prominent marker
    extractedText += '====== END OF TOPIC ======\n';

    // Generate filename based on the discussion title
    const filename = `${title.replace(/\s+/g, '_').replace(/[^\w_]/g, '')}.txt`;

    // Download the formatted text as a .txt file
    downloadText(filename, extractedText);
})();
