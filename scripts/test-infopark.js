import * as cheerio from 'cheerio';
import axios from 'axios';

async function run() {
  console.log('Testing Infopark...');
  try {
    const { data } = await axios.get('https://infopark.in/companies/job-search', { timeout: 10000 });
    const $ = cheerio.load(data);
    
    console.log('Total divs:', $('div').length);
    // Extract table rows
    $('tr').slice(0, 5).each((i, row) => {
      console.log(`Row ${i}:`);
      $(row).find('th, td').each((j, cell) => {
        console.log(`  Cell ${j}:`, $(cell).text().trim());
      });
      console.log(`  Links:`, $(row).find('a').map((_, a) => $(a).attr('href')).get());
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}
run();
