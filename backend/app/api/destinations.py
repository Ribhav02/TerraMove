import re
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Query

router = APIRouter()

SECTOR17_DESTINATIONS = [
    {
        "id": "central_plaza",
        "name": "Sector 17 Central Plaza",
        "category": "Plaza / Public Square",
        "lat": 30.7410,
        "lon": 76.7820,
        "description": "Pedestrian heart of Chandigarh with musical fountains and open promenade.",
        "aliases": [
            "plaza", "central plaza", "main plaza", "sector 17 plaza", "city center",
            "fountain", "musical fountain", "fuhara", "phowara",
            "प्लाज़ा", "सेंट्रल प्लाज़ा", "फव्वारा", "सिटी सेंटर"
        ]
    },
    {
        "id": "neelam_cinema",
        "name": "Neelam Cinema Corridor",
        "category": "Heritage Landmark / Cinema",
        "lat": 30.7395,
        "lon": 76.7810,
        "description": "Historic cinema building designed by Le Corbusier's team; shaded arcade zone.",
        "aliases": [
            "neelam", "neelam cinema", "cinema", "theatre", "theater", "movie",
            "south promenade", "south arcade",
            "नीलम", "नीलम सिनेमा", "सिनेमा", "थिएटर"
        ]
    },
    {
        "id": "kc_theatre",
        "name": "KC Theatre Commercial Block",
        "category": "Commercial / Retail",
        "lat": 30.7420,
        "lon": 76.7845,
        "description": "Major commercial and shopping block near northern Sector 17 walkway.",
        "aliases": [
            "kc", "kc theatre", "kc theater", "kc cinema", "kc commercial", "cinema",
            "केसी", "केसी थिएटर", "केसी सिनेमा"
        ]
    },
    {
        "id": "bank_square",
        "name": "Bank Square (SCO 1-20)",
        "category": "Financial / Commercial",
        "lat": 30.7415,
        "lon": 76.7870,
        "description": "Financial hub with SBI and regional banking headquarters along eastern corridor.",
        "aliases": [
            "bank square", "bank", "banks", "sbi", "state bank", "financial square",
            "sco", "banking",
            "बैंक स्क्वायर", "बैंक", "एसबीआई"
        ]
    },
    {
        "id": "isbt_17",
        "name": "ISBT Sector 17 Bus Terminal",
        "category": "Transit Hub",
        "lat": 30.7350,
        "lon": 76.7800,
        "description": "Southern inter-state bus terminus and regional transit interchange.",
        "aliases": [
            "isbt", "isbt 17", "bus stand", "bus terminal", "bus station", "bus stop",
            "transit", "terminal",
            "आई एस बी टी", "बस स्टैंड", "बस अड्डा", "बस टर्मिनल"
        ]
    },
    {
        "id": "north_gate",
        "name": "Sector 17 North Gate / Garden",
        "category": "Green Space / Park",
        "lat": 30.7455,
        "lon": 76.7805,
        "description": "North boundary transition towards Shanti Kunj and Rose Garden promenade.",
        "aliases": [
            "north gate", "gate", "garden", "rose garden", "shanti kunj", "park",
            "north entrance", "green belt",
            "उत्तर गेट", "गेट", "गार्डन", "पार्क", "शांति कुंज"
        ]
    },
    {
        "id": "tdi_mall",
        "name": "TDI Mall Sector 17",
        "category": "Shopping Mall",
        "lat": 30.7402,
        "lon": 76.7835,
        "description": "Retail shopping mall with covered arcade walkways.",
        "aliases": [
            "tdi", "tdi mall", "mall", "shopping mall", "shopping",
            "टीडीआई", "टीडीआई मॉल", "मॉल"
        ]
    },
    {
        "id": "sindhi_sweets",
        "name": "Sindhi Sweets Plaza",
        "category": "Dining / Heritage Food",
        "lat": 30.7408,
        "lon": 76.7824,
        "description": "Iconic Sector 17 sweets and dining landmark on central promenade.",
        "aliases": [
            "sindhi sweets", "sindhi", "sweets", "mithai", "restaurant", "food",
            "सिंधी स्वीट्स", "सिंधी", "मिठाई", "खाना"
        ]
    },
    {
        "id": "english_book_shop",
        "name": "The English Book Shop",
        "category": "Retail / Bookstore",
        "lat": 30.7412,
        "lon": 76.7828,
        "description": "Historic Sector 17 independent bookstore along the main shopping row.",
        "aliases": [
            "english book shop", "book shop", "bookstore", "books", "kitab",
            "बुक शॉप", "किताबों की दुकान"
        ]
    },
    {
        "id": "haryana_secretariat",
        "name": "Haryana Secretariat / Govt Offices",
        "category": "Civic / Government",
        "lat": 30.7428,
        "lon": 76.7858,
        "description": "Administrative offices and public departments.",
        "aliases": [
            "secretariat", "haryana secretariat", "govt office", "sarkari",
            "civic center", "office",
            "सचिवालय", "सरकारी दफ्तर", "हरियाणा सचिवालय"
        ]
    },
    {
        "id": "multilevel_parking",
        "name": "Sector 17 Multilevel Parking Lot",
        "category": "Parking Facility",
        "lat": 30.7418,
        "lon": 76.7813,
        "description": "Large automated municipal parking facility with 900+ capacity.",
        "aliases": [
            "multilevel parking", "parking", "car park", "parking lot", "vehicle parking",
            "मल्टीलेवल पार्किंग", "पार्किंग", "गाड़ी पार्किंग"
        ]
    }
]

def clean_text(text: str) -> str:
    # Lowercase and remove punctuation
    t = text.lower().strip()
    return re.sub(r'[^\w\s\u0900-\u097F]', ' ', t)

@router.get("/destinations/search")
async def search_destinations(
    q: str = Query(..., min_length=1, description="Destination search query in English, Hindi, or Hinglish"),
    lang: Optional[str] = Query("en", description="Language hint: 'en' or 'hi'")
):
    cleaned = clean_text(q)
    tokens = [t for t in cleaned.split() if len(t) > 1]
    
    # Check stop words (e.g., "go to", "take me to", "jaana hai", "chalo")
    stop_words = {
        "go", "to", "take", "me", "navigate", "towards", "near", "find",
        "jaana", "hai", "mujhe", "chalo", "le", "chaliye", "dikhaye", "kripya",
        "please", "route", "direction", "directions", "walk"
    }
    filtered_tokens = [t for t in tokens if t not in stop_words]
    search_tokens = filtered_tokens if filtered_tokens else tokens

    matches = []
    generic_keywords = {
        "cinema", "theatre", "theater", "movie", "hall", "film", "सिनेमा", "थिएटर",
        "bank", "atm", "banks", "बैंक",
        "parking", "parkings", "car", "park", "पार्किंग",
        "plaza", "square", "chowk", "चौक", "प्लाजा",
        "garden", "parks", "gardens", "बगीचा", "पार्क",
        "shop", "store", "bookstore", "market", "bazaar", "shops", "stores", "दुकान", "बाजार",
        "restaurant", "hotel", "food", "cafe", "होटल", "खाना",
        "office", "govt", "secretariat", "offices", "दफ्तर"
    }
    specific_tokens = [t for t in search_tokens if t not in generic_keywords]
    is_purely_generic_query = len(specific_tokens) == 0 and len(search_tokens) > 0
    
    for dest in SECTOR17_DESTINATIONS:
        dest_name_clean = clean_text(dest["name"])
        matched_aliases = []
        score = 0.0

        # Direct name checks
        if cleaned == dest_name_clean:
            score = max(score, 1.0)
        elif cleaned in dest_name_clean:
            score = max(score, 0.85)

        for alias in dest["aliases"]:
            alias_clean = clean_text(alias)
            if alias_clean == cleaned:
                score = max(score, 0.95)
                matched_aliases.append(alias)
            elif cleaned in alias_clean:
                score = max(score, 0.75)
                matched_aliases.append(alias)
            elif alias_clean in cleaned:
                if alias_clean not in generic_keywords:
                    score = max(score, 0.85)
                    matched_aliases.append(alias)
                else:
                    score = max(score, 0.40)
            else:
                alias_words = alias_clean.split()
                overlap = sum(1 for tok in search_tokens if tok in alias_words)
                if overlap > 0:
                    token_score = 0.4 * (overlap / max(len(search_tokens), len(alias_words)))
                    if token_score > score:
                        score = token_score
                    matched_aliases.append(alias)

        if score > 0.35:
            matches.append({
                "destination": {
                    "id": dest["id"],
                    "name": dest["name"],
                    "category": dest["category"],
                    "lat": dest["lat"],
                    "lon": dest["lon"],
                    "description": dest["description"]
                },
                "score": round(score, 2),
                "matched_aliases": list(set(matched_aliases))
            })

    # Sort matches descending by score
    matches.sort(key=lambda x: x["score"], reverse=True)

    if len(matches) > 1:
        score_diff = matches[0]["score"] - matches[1]["score"]
        is_ambiguous = is_purely_generic_query or (score_diff < 0.20)
    else:
        is_ambiguous = False

    top_candidates = [m["destination"] for m in matches[:5]]

    if not matches:
        note = f"No verified Sector 17 landmarks found matching '{q}'. Please choose from known Sector 17 locations or use map coordinates."
    elif is_ambiguous:
        note = f"Found {len(matches)} matching locations for '{q}'. Please select one to confirm coordinates."
    else:
        note = f"Verified Sector 17 landmark found for '{q}'."

    return {
        "query": q,
        "language_hint": lang,
        "match_count": len(matches),
        "is_ambiguous": is_ambiguous,
        "top_match": top_candidates[0] if (top_candidates and not is_ambiguous) else None,
        "candidates": top_candidates,
        "note": note
    }

@router.get("/destinations/list")
async def list_destinations():
    return {
        "sector": "Sector 17, Chandigarh",
        "count": len(SECTOR17_DESTINATIONS),
        "destinations": [
            {
                "id": d["id"],
                "name": d["name"],
                "category": d["category"],
                "lat": d["lat"],
                "lon": d["lon"]
            }
            for d in SECTOR17_DESTINATIONS
        ]
    }
