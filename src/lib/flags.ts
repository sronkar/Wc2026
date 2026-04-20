const FLAGS: Record<string, string> = {
  // Hosts
  "United States": "🇺🇸", "USA": "🇺🇸",
  "Mexico": "🇲🇽",
  "Canada": "🇨🇦",

  // South America
  "Argentina": "🇦🇷", "Brazil": "🇧🇷", "Colombia": "🇨🇴",
  "Ecuador": "🇪🇨", "Uruguay": "🇺🇾", "Venezuela": "🇻🇪",
  "Paraguay": "🇵🇾", "Peru": "🇵🇪", "Bolivia": "🇧🇴", "Chile": "🇨🇱",

  // Europe
  "Germany": "🇩🇪", "France": "🇫🇷", "Spain": "🇪🇸", "Portugal": "🇵🇹",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Netherlands": "🇳🇱", "Belgium": "🇧🇪",
  "Italy": "🇮🇹", "Croatia": "🇭🇷", "Switzerland": "🇨🇭",
  "Austria": "🇦🇹", "Denmark": "🇩🇰", "Sweden": "🇸🇪", "Norway": "🇳🇴",
  "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "Turkey": "🇹🇷", "Türkiye": "🇹🇷",
  "Czech Republic": "🇨🇿", "Czechia": "🇨🇿",
  "Serbia": "🇷🇸", "Hungary": "🇭🇺", "Slovakia": "🇸🇰",
  "Albania": "🇦🇱", "Romania": "🇷🇴", "Georgia": "🇬🇪",
  "Ukraine": "🇺🇦", "Slovenia": "🇸🇮", "Poland": "🇵🇱",
  "Greece": "🇬🇷", "Iceland": "🇮🇸", "Finland": "🇫🇮",
  "Russia": "🇷🇺", "Ireland": "🇮🇪", "Northern Ireland": "🇬🇧",
  "Bosnia and Herzegovina": "🇧🇦", "Bosnia & Herzegovina": "🇧🇦", "Bosnia-Herzegovina": "🇧🇦",
  "Montenegro": "🇲🇪",
  "North Macedonia": "🇲🇰", "Kosovo": "🇽🇰", "Luxembourg": "🇱🇺",
  "Belarus": "🇧🇾", "Bulgaria": "🇧🇬", "Estonia": "🇪🇪",
  "Latvia": "🇱🇻", "Lithuania": "🇱🇹", "Kazakhstan": "🇰🇿",

  // Africa
  "Morocco": "🇲🇦", "Senegal": "🇸🇳", "Nigeria": "🇳🇬",
  "Cameroon": "🇨🇲", "Ivory Coast": "🇨🇮", "Côte d'Ivoire": "🇨🇮",
  "South Africa": "🇿🇦", "DR Congo": "🇨🇩", "Egypt": "🇪🇬",
  "Tunisia": "🇹🇳", "Ghana": "🇬🇭", "Algeria": "🇩🇿",
  "Mali": "🇲🇱", "Zambia": "🇿🇲", "Tanzania": "🇹🇿",
  "Uganda": "🇺🇬", "Benin": "🇧🇯", "Cape Verde": "🇨🇻",
  "Gabon": "🇬🇦", "Mozambique": "🇲🇿", "Guinea": "🇬🇳",
  "Zimbabwe": "🇿🇼", "Namibia": "🇳🇦", "Kenya": "🇰🇪",
  "Ethiopia": "🇪🇹", "Angola": "🇦🇴",

  // Asia
  "Japan": "🇯🇵", "South Korea": "🇰🇷", "Korea Republic": "🇰🇷",
  "Iran": "🇮🇷", "Saudi Arabia": "🇸🇦", "Australia": "🇦🇺",
  "Qatar": "🇶🇦", "Jordan": "🇯🇴", "Iraq": "🇮🇶",
  "Oman": "🇴🇲", "Uzbekistan": "🇺🇿", "China": "🇨🇳", "China PR": "🇨🇳",
  "Indonesia": "🇮🇩", "Thailand": "🇹🇭", "Vietnam": "🇻🇳",
  "Bahrain": "🇧🇭", "UAE": "🇦🇪", "United Arab Emirates": "🇦🇪",
  "Kuwait": "🇰🇼", "Palestine": "🇵🇸", "Lebanon": "🇱🇧",
  "Syria": "🇸🇾", "India": "🇮🇳", "Kyrgyzstan": "🇰🇬",
  "Tajikistan": "🇹🇯", "Myanmar": "🇲🇲",

  // CONCACAF
  "Jamaica": "🇯🇲", "Honduras": "🇭🇳", "Panama": "🇵🇦",
  "Costa Rica": "🇨🇷", "El Salvador": "🇸🇻",
  "Trinidad and Tobago": "🇹🇹", "Trinidad & Tobago": "🇹🇹",
  "Guatemala": "🇬🇹", "Cuba": "🇨🇺", "Haiti": "🇭🇹",
  "Nicaragua": "🇳🇮", "Bermuda": "🇧🇲",
  "Curaçao": "🇨🇼", "Curacao": "🇨🇼",
  "Martinique": "🇲🇶", "Guadeloupe": "🇬🇵",
  "Dominican Republic": "🇩🇴", "Belize": "🇧🇿",
  "Suriname": "🇸🇷",

  // Oceania
  "New Zealand": "🇳🇿", "Fiji": "🇫🇯", "Papua New Guinea": "🇵🇬",
  "Solomon Islands": "🇸🇧", "Vanuatu": "🇻🇺", "Tahiti": "🇵🇫",
  "New Caledonia": "🇳🇨",
};

export function getFlag(team: string): string {
  return FLAGS[team] ?? "";
}
