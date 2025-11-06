module.exports = {
  onPreBuild: ({ utils }) => {
    // Create config.js with environment variables
    const configContent = `
window.SUPABASE_URL = '${process.env.SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';
window.GROQ_API_KEY = '${process.env.GROQ_API_KEY || ''}';
`;

    // Ensure scripts directory exists
    utils.build.failBuild('Failed to create config.js: ' + error.message);
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      const configDir = path.join(__dirname, 'public', 'scripts');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // Write config file
      fs.writeFileSync(path.join(configDir, 'config.js'), configContent);
      console.log('Successfully created config.js');
    } catch (error) {
      utils.build.failBuild('Failed to create config.js: ' + error.message);
    }
  }
}