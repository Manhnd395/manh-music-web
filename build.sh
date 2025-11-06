#!/bin/bash

# Create config.js with environment variables
cat > public/scripts/config.js << EOL
window.SUPABASE_URL = '${SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';
window.GROQ_API_KEY = '${GROQ_API_KEY}';
EOL