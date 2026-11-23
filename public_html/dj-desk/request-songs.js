// Curated guest suggestions. Chart references are inspiration; the entries are alphabetical.
export const schoolSongs = [
  ["APT.","ROSÉ & Bruno Mars"],
  ["Beautiful Things","Benson Boone"],
  ["Birds of a Feather","Billie Eilish"],
  ["Blinding Lights","The Weeknd"],
  ["Boston","Stella Lefty"],
  ["Break My Soul","Beyoncé"],
  ["Can't Stop the Feeling!","Justin Timberlake"],
  ["Cruel Summer","Taylor Swift"],
  ["Dance the Night","Dua Lipa"],
  ["Die With a Smile","Lady Gaga & Bruno Mars"],
  ["Don't Start Now","Dua Lipa"],
  ["Dynamite","BTS"],
  ["Electric Love","BØRNS"],
  ["Firework","Katy Perry"],
  ["Flowers","Miley Cyrus"],
  ["Golden","HUNTR/X: EJAE, Audrey Nuna & REI AMI"],
  ["Good Time","Owl City & Carly Rae Jepsen"],
  ["Happy","Pharrell Williams"],
  ["High Hopes","Panic! at the Disco"],
  ["Higher Love","Kygo & Whitney Houston"],
  ["I Just Might","Bruno Mars"],
  ["I Like Me Better","Lauv"],
  ["I Wanna Dance with Somebody (Who Loves Me)","Whitney Houston"],
  ["I Want You Back","The Jackson 5"],
  ["Levitating","Dua Lipa"],
  ["Love Story","Taylor Swift"],
  ["Midnight Sun","Zara Larsson"],
  ["Mystical Magical","Benson Boone"],
  ["On Top of the World","Imagine Dragons"],
  ["One Kiss","Calvin Harris & Dua Lipa"],
  ["Ordinary","Alex Warren"],
  ["Permission to Dance","BTS"],
  ["Rather Be","Clean Bandit feat. Jess Glynne"],
  ["Risk It All","Bruno Mars"],
  ["Señorita","Shawn Mendes & Camila Cabello"],
  ["September","Earth, Wind & Fire"],
  ["Shake It Off","Taylor Swift"],
  ["Shivers","Ed Sheeran"],
  ["Shut Up and Dance","WALK THE MOON"],
  ["Sorry I'm Here for Someone Else","Benson Boone"],
  ["Stargazing","Myles Smith"],
  ["Story of My Life","One Direction"],
  ["Sunroof","Nicky Youre & dazy"],
  ["Sweet Caroline","Neil Diamond"],
  ["The Nights","Avicii"],
  ["Try Everything","Shakira"],
  ["Unstoppable","Sia"],
  ["Viva la Vida","Coldplay"],
  ["Wake Me Up","Avicii"],
  ["What Makes You Beautiful","One Direction"]
];

export const partySongs = [
  ["Ain't No Mountain High Enough","Marvin Gaye & Tammi Terrell"],
  ["At Last","Etta James"],
  ["Billie Jean","Michael Jackson"],
  ["Brown Eyed Girl","Van Morrison"],
  ["Can't Help Falling in Love","Elvis Presley"],
  ["Celebration","Kool & the Gang"],
  ["Crazy in Love","Beyoncé feat. Jay-Z"],
  ["Dancing Queen","ABBA"],
  ["Don't Stop Believin'","Journey"],
  ["Don't Stop Me Now","Queen"],
  ["Everybody (Backstreet's Back)","Backstreet Boys"],
  ["Footloose","Kenny Loggins"],
  ["Get Lucky","Daft Punk feat. Pharrell Williams"],
  ["Hey Ya!","Outkast"],
  ["I Gotta Feeling","The Black Eyed Peas"],
  ["I Wanna Dance with Somebody (Who Loves Me)","Whitney Houston"],
  ["I Want It That Way","Backstreet Boys"],
  ["I'll Be","Edwin McCain"],
  ["Isn't She Lovely","Stevie Wonder"],
  ["Let's Groove","Earth, Wind & Fire"],
  ["Love on Top","Beyoncé"],
  ["Marry You","Bruno Mars"],
  ["Mr. Brightside","The Killers"],
  ["My Girl","The Temptations"],
  ["Never Gonna Give You Up","Rick Astley"],
  ["Perfect","Ed Sheeran"],
  ["Respect","Aretha Franklin"],
  ["September","Earth, Wind & Fire"],
  ["Shout","The Isley Brothers"],
  ["Signed, Sealed, Delivered I'm Yours","Stevie Wonder"],
  ["Stayin' Alive","Bee Gees"],
  ["Sweet Caroline","Neil Diamond"],
  ["This Will Be (An Everlasting Love)","Natalie Cole"],
  ["Twist and Shout","The Beatles"],
  ["Uptown Funk","Mark Ronson feat. Bruno Mars"],
  ["Wannabe","Spice Girls"],
  ["We Are Family","Sister Sledge"],
  ["Yeah!","Usher feat. Lil Jon & Ludacris"],
  ["You Make My Dreams","Daryl Hall & John Oates"],
  ["Your Song","Elton John"]
];

function normalize(value) {
    return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function editDistance(left, right) {
    let previous = Array.from({length: right.length + 1}, (_, index) => index);
    for (let row = 1; row <= left.length; row++) {
        const current = [row];
        for (let col = 1; col <= right.length; col++) {
            current[col] = Math.min(current[col - 1] + 1, previous[col] + 1,
                previous[col - 1] + Number(left[row - 1] !== right[col - 1]));
        }
        previous = current;
    }
    return previous[right.length];
}

export function spellingSuggestion(value, choices) {
    const text = normalize(value);
    if (text.length < 4) return null;
    const limit = text.length >= 6 ? 2 : 1;
    let best = limit + 1;
    let suggestion = null;
    for (const choice of new Set(choices)) {
        const normalized = normalize(choice);
        if (text === normalized) return null;
        if (Math.abs(text.length - normalized.length) > limit || normalized.startsWith(text)) continue;
        const distance = editDistance(text, normalized);
        if (distance < best) {
            best = distance;
            suggestion = choice;
        } else if (distance === best) {
            suggestion = null;
        }
    }
    return suggestion;
}
