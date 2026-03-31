import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
type StepId = "template" | "intercession" | "name" | "intention" | "logging" | "schedule" | "goal" | "invite"
  | "bcp-commitment" | "bcp-frequency" | "bcp-time" | "bcp-invite" | "intercession-frequency";
type LoggingType = "photo" | "reflection" | "both" | "checkin";
type Frequency = "daily" | "weekly";
type TimeOfDay = "early-morning" | "morning" | "midday" | "afternoon" | "late-afternoon" | "evening" | "night";
type BcpFreqType = "once" | "twice" | "three" | "five" | "daily";

// ─── BCP Frequency options ────────────────────────────────────────────────────
const BCP_FREQ_OPTIONS: {
  id: BcpFreqType; emoji: string; label: string; sub: string;
  dots: number; daysPerWeek: number; badge: string | null;
  bg: string; message: string;
}[] = [
  { id: "once",  emoji: "🌱", label: "Once a week",       sub: "A gentle beginning",  dots: 1, daysPerWeek: 1, badge: null,          bg: "#EEF3EF", message: "One office together each week. A beginning." },
  { id: "twice", emoji: "🌿", label: "Twice a week",       sub: "Taking root",         dots: 2, daysPerWeek: 2, badge: null,          bg: "#E8F0EA", message: "Two offices. Enough to find a rhythm." },
  { id: "three", emoji: "🌸", label: "Three times a week", sub: "A real rhythm",       dots: 3, daysPerWeek: 3, badge: "Most chosen 🌿", bg: "#E0EBE2", message: "Three times. This is where something real takes root." },
  { id: "five",  emoji: "🌳", label: "Five times a week",  sub: "A weekday practice",  dots: 5, daysPerWeek: 5, badge: null,          bg: "#F7F0E6", message: "The weekday office. A serious commitment." },
  { id: "daily", emoji: "✨", label: "Daily",              sub: "The full Daily Office", dots: 7, daysPerWeek: 7, badge: null,         bg: "#F7F0E6", message: "Every day. The full practice of the Daily Office." },
];

const WEEK_DAYS = [
  { id: "MO", label: "Mon" }, { id: "TU", label: "Tue" }, { id: "WE", label: "Wed" },
  { id: "TH", label: "Thu" }, { id: "FR", label: "Fri" }, { id: "SA", label: "Sat" }, { id: "SU", label: "Sun" },
];

const SPIRITUAL_TEMPLATES = new Set(["morning-prayer", "evening-prayer", "intercession", "contemplative", "fasting", "custom"]);

const TIME_OF_DAY_OPTIONS: { id: TimeOfDay; emoji: string; label: string; sub: string; range: string }[] = [
  { id: "early-morning",  emoji: "🌄", label: "Early morning",  sub: "Before the day begins",             range: "5am – 8am" },
  { id: "morning",        emoji: "🌅", label: "Morning",        sub: "As the day begins",                 range: "8am – 11am" },
  { id: "midday",         emoji: "☀️",  label: "Midday",         sub: "A pause at the center of the day",  range: "11am – 2pm" },
  { id: "afternoon",      emoji: "🌤", label: "Afternoon",      sub: "Before the day winds down",         range: "2pm – 6pm" },
  { id: "late-afternoon", emoji: "🌇", label: "Late afternoon", sub: "The day winds down",                range: "4pm – 7pm" },
  { id: "evening",        emoji: "🌆", label: "Evening",        sub: "As the day releases",               range: "7pm – 10pm" },
  { id: "night",          emoji: "🌙", label: "Night",          sub: "The quiet before rest",             range: "9pm – 11pm" },
];

// Constraints per time-of-day (for the personal time picker)
const TOD_CONSTRAINTS: Record<string, { hours: number[]; amPm: "AM" | "PM" | "mixed"; defaultH: number; defaultAmPm: "AM" | "PM" }> = {
  "early-morning":  { hours: [5,6,7],        amPm: "AM",    defaultH: 6,  defaultAmPm: "AM" },
  "morning":        { hours: [8,9,10,11],     amPm: "AM",    defaultH: 8,  defaultAmPm: "AM" },
  "midday":         { hours: [11,12,1,2],     amPm: "mixed", defaultH: 12, defaultAmPm: "PM" },
  "afternoon":      { hours: [2,3,4,5,6],     amPm: "PM",    defaultH: 3,  defaultAmPm: "PM" },
  "late-afternoon": { hours: [4,5,6,7],       amPm: "PM",    defaultH: 5,  defaultAmPm: "PM" },
  "evening":        { hours: [7,8,9,10],      amPm: "PM",    defaultH: 8,  defaultAmPm: "PM" },
  "night":          { hours: [9,10,11],       amPm: "PM",    defaultH: 9,  defaultAmPm: "PM" },
};

const INTERCESSION_EXAMPLES = [
  "The climate and all those most affected by its changes",
  "Our parish and those we serve in this community",
  "Those who lead our nation — that they find courage and wisdom",
  "The sick, the suffering, and those who care for them",
  "Our enemies and those with whom we are in conflict",
  "The earth and every living thing that depends on it",
];

interface ContactSuggestion { name: string; email: string; }

interface BcpPrayer { category: string; title: string; text: string; }

// ─── BCP Prayers (Book of Common Prayer 1979, public domain) ─────────────────
const BCP_PRAYERS: BcpPrayer[] = [
  // FOR THE CHURCH
  { category: "For the Church", title: "For the Universal Church",
    text: "O God of unchangeable power and eternal light: Look favorably on your whole Church, that wonderful and sacred mystery; by the effectual working of your providence, carry out in tranquillity the plan of salvation; let the whole world see and know that things which were cast down are being raised up, and things which had grown old are being made new, and that all things are being brought to their perfection by him through whom all things were made, your Son Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For a Church Convention or Meeting",
    text: "Almighty and everlasting God, who by the Holy Spirit presided over the council of the blessed Apostles, and has promised, through your Son Jesus Christ, to be present wherever two or three are gathered together in his Name: Grant that as we meet together in your Name, so we may be bound together by your Spirit, and find our decisions to be the expression of your will; through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For the Unity of the Church",
    text: "O God the Father of our Lord Jesus Christ, our only Savior, the Prince of Peace: Give us grace seriously to lay to heart the great dangers we are in by our unhappy divisions; take away all hatred and prejudice, and whatever else may hinder us from godly union and concord; that, as there is but one Body and one Spirit, one hope of our calling, one Lord, one Faith, one Baptism, one God and Father of us all, so we may be all of one heart and of one soul, united in one holy bond of truth and peace, of faith and charity, and may with one mind and one mouth glorify thee; through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For the Church's Ministry",
    text: "O God, you led your holy apostles to ordain ministers in every place: Grant that your Church, under the guidance of the Holy Spirit, may choose suitable persons for the ministry of Word and Sacrament, and may uphold them in their work for the extension of your kingdom; through him who is the Shepherd and Bishop of our souls, Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, for ever and ever. Amen." },
  { category: "For the Church", title: "For the Election of a Bishop or other Minister",
    text: "Almighty God, giver of every good gift: Look graciously on your Church, and so guide the minds of those who shall choose a bishop for this diocese (or, a rector for this parish), that we may receive a faithful pastor, who will care for your people and equip us for our ministries; through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For the Consecration of a Church",
    text: "O Eternal God, mighty in power and of incomprehensible majesty, whom the heaven of heavens cannot contain, much less the walls of temples made with hands; graciously accept the dedication of this place to your honor and glory, through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For a Church or Mission",
    text: "Everliving God, whose will it is that all should come to you through your Son Jesus Christ: Inspire our witness to him, that all may know the power of his forgiveness and the hope of his resurrection; who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen." },
  { category: "For the Church", title: "For a Vestry or other Governing Body",
    text: "O Eternal God, the fountain of all wisdom: Enlighten with your grace the vestry of this parish, and all who bear authority in your Church, that they may seek above all things your honor and glory; strengthen them to bear their burdens well; and grant that with willing hearts they may devote their powers to your service, and to the welfare of your people; through Jesus Christ our Lord. Amen." },

  // FOR THE MISSION OF THE CHURCH
  { category: "For the Mission of the Church", title: "For the Spread of the Gospel",
    text: "O God of all nations of the earth: Remember the multitudes who have been created in your image but have not known the redeeming work of our Savior Jesus Christ; and grant that, by the prayers and labors of your holy Church, they may be brought to know and worship you as you have been revealed in your Son; who lives and reigns with you and the Holy Spirit, one God, for ever and ever. Amen." },
  { category: "For the Mission of the Church", title: "For the Mission of the Church",
    text: "Everliving God, whose will it is that all people should come to you through your Son Jesus Christ: Inspire our witness to him, that all may know the power of his forgiveness and the hope of his resurrection; who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen." },
  { category: "For the Mission of the Church", title: "For Missionaries",
    text: "Almighty and everlasting God, who alone works great marvels: Send down upon all missionaries and the congregations committed to their care the healthful Spirit of your grace; and, that they may truly please you, pour upon them the continual dew of your blessing. Grant this, O Lord, for the honor of our Advocate and Mediator, Jesus Christ. Amen." },
  { category: "For the Mission of the Church", title: "For the Peace of Jerusalem",
    text: "O God, the King of glory, who exalted your Son Jesus Christ with great triumph to your kingdom in heaven: We beseech you, leave us not comfortless; but send us your Holy Spirit to strengthen us, and exalt us to the place where our Savior Christ is gone before; who lives and reigns with you and the Holy Spirit, one God, in glory everlasting. Amen." },
  { category: "For the Mission of the Church", title: "For our Enemies",
    text: "O God, the Father of all, whose Son commanded us to love our enemies: Lead them and us from prejudice to truth; deliver them and us from hatred, cruelty, and revenge; and in your good time enable us all to stand reconciled before you; through Jesus Christ our Lord. Amen." },
  { category: "For the Mission of the Church", title: "For Those Who Suffer for the Faith",
    text: "O God of all the prophets, you have always sent messengers who were rejected and persecuted: Grant to all who suffer for the sake of the gospel the grace to persevere, endurance for the trial, and hope in the resurrection; through Jesus Christ our Lord, who suffered and was glorified. Amen." },

  // FOR THE NATION
  { category: "For the Nation", title: "For Our Country",
    text: "Almighty God, who has given us this good land as our heritage: We humbly ask that we may always prove ourselves a people mindful of your favor and glad to do your will. Bless our land with honorable industry, sound learning, and pure manners. Save us from violence, discord, and confusion; from pride and arrogance, and from every evil way. In the time of prosperity, fill our hearts with thankfulness, and in the day of trouble, suffer not our trust in you to fail. Amen." },
  { category: "For the Nation", title: "For the President and all in Civil Authority",
    text: "O Lord our Governor, whose glory is in all the world: We commend this nation to your merciful care, that, being guided by your Providence, we may dwell secure in your peace. Grant to the President of the United States, the Governor of this State, and to all in authority, wisdom and strength to know and to do your will. Fill them with the love of truth and righteousness, and make them ever mindful of their calling to serve this people in your fear; through Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, world without end. Amen." },
  { category: "For the Nation", title: "For Congress or a State Legislature",
    text: "O God, the fountain of wisdom, whose will is good and gracious, and whose law is truth: We beseech you so to guide and bless our Legislature (or the Congress of the United States), that it may ordain for our governance only such things as please you, to the glory of your Name and the welfare of this people; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For Courts of Justice",
    text: "Almighty God, who sittest in the throne judging right: We humbly beseech you to bless the courts of justice and the magistrates in all this land; and give unto them the spirit of wisdom and understanding, that they may discern the truth, and impartially administer the law in the fear of you alone; through him who shall come to be our Judge, your Son our Savior Jesus Christ. Amen." },
  { category: "For the Nation", title: "For Sound Government",
    text: "O Lord our Governor, bless the leaders of our land, that we may be a people at peace among ourselves and a blessing to other nations of the earth. Lord, keep this nation under your care. To all who have executive authority and to all who have administrative authority, grant wisdom and grace in the exercise of their duties. Give grace to your servants to put away all envy, hatred, and malice; and grant that they lead us in ways of justice, peace, and love; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For Local Government",
    text: "Almighty God our heavenly Father, send down upon those who hold office in this State (Commonwealth, City, County, Town, ___) the spirit of wisdom, charity, and justice; that with steadfast purpose they may faithfully serve in their offices to promote the well-being of all people; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For an Election",
    text: "Almighty God, to whom we must account for all our powers and privileges: Guide the people of the United States in the election of officials and representatives; that, by faithful administration and wise laws, the rights of all may be protected and our nation be enabled to fulfill your purposes; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For those in the Armed Forces of our Country",
    text: "Almighty God, we commend to your gracious care and keeping all the men and women of our armed forces at home and abroad. Defend them day by day with your heavenly grace; strengthen them in their trials and temptations; give them courage to face the perils which beset them; and grant them a sense of your abiding presence wherever they may be; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For those who Suffer for the Sake of Conscience",
    text: "O God our Father, whose Son forgave his enemies while he was suffering shame and death: Strengthen those who suffer for the sake of conscience; when they are accused, save them from speaking in hate; when they are rejected, save them from bitterness; when they are imprisoned, save them from despair; and to us your servants, give grace to respect their witness and to discern the truth, that our society may be cleansed and strengthened. This we ask for the sake of Jesus Christ, our merciful and righteous Judge. Amen." },

  // FOR THE WORLD
  { category: "For the World", title: "For Peace Among Nations",
    text: "Almighty God, our heavenly Father, guide the nations of the world into the way of justice and truth, and establish among them that peace which is the fruit of righteousness, that they may become the kingdom of our Lord and Savior Jesus Christ. Amen." },
  { category: "For the World", title: "For Peace",
    text: "Eternal God, in whose perfect kingdom no sword is drawn but the sword of righteousness, no strength known but the strength of love: So mightily spread abroad your Spirit, that all peoples may be gathered under the banner of the Prince of Peace, as children of one Father; to whom be dominion and glory, now and for ever. Amen." },
  { category: "For the World", title: "For our Enemies",
    text: "O God, the Father of all, whose Son commanded us to love our enemies: Lead them and us from prejudice to truth; deliver them and us from hatred, cruelty, and revenge; and in your good time enable us all to stand reconciled before you; through Jesus Christ our Lord. Amen." },
  { category: "For the World", title: "For the Human Family",
    text: "O God, you made us in your own image and redeemed us through Jesus your Son: Look with compassion on the whole human family; take away the arrogance and hatred which infect our hearts; break down the walls that separate us; unite us in bonds of love; and work through our struggle and confusion to accomplish your purposes on earth; that, in your good time, all nations and races may serve you in harmony around your heavenly throne; through Jesus Christ our Lord. Amen." },
  { category: "For the World", title: "For the United Nations",
    text: "O God, who in your gracious Providence has permitted the nations of the world to come together in counsel: Guide, we pray, by your most Holy Spirit those who deliberate on behalf of the nations, that putting away pride, hatred, and greed, they may find a way of peace for the nations of the world; through Jesus Christ our Lord. Amen." },
  { category: "For the World", title: "In Times of Conflict",
    text: "O God, you have bound us together in a common life. Help us, in the midst of our struggles for justice and truth, to confront one another without hatred or bitterness, and to work together with mutual forbearance and respect; through Jesus Christ our Lord. Amen." },

  // FOR THE NATURAL ORDER
  { category: "For the Natural Order", title: "For the Conservation of Natural Resources",
    text: "Almighty God, in giving us dominion over things on earth, you made us fellow workers in your creation: Give us wisdom and reverence so to use the resources of nature, that no one may suffer from our abuse of them, and that generations yet to come may continue to praise you for your bounty; through Jesus Christ our Lord. Amen." },
  { category: "For the Natural Order", title: "For the Harvest of Lands and Waters",
    text: "O gracious Father, who opens your hand and fills all living things: Bless the lands and waters, and multiply the harvests of the world; let your Spirit go forth, that it may renew the face of the earth; show your loving-kindness, that our land may give her increase; and save us from selfish use of what you give, that men and women everywhere may give you thanks; through Christ our Lord. Amen." },
  { category: "For the Natural Order", title: "For Rain",
    text: "O God, heavenly Father, who by your Son Jesus Christ has promised to all who seek your kingdom and its righteousness all things necessary to sustain their life: Send us, we entreat you, in this our necessity, such moderate rain and showers, that we may receive the fruits of the earth to our comfort and to your honor; through Jesus Christ our Lord. Amen." },
  { category: "For the Natural Order", title: "For the Future of the Human Race",
    text: "O God our heavenly Father, you have blessed us and given us dominion over all the earth: Increase our reverence before the mystery of life; and give us new insight into your purposes for the human race, and for the world you have made, that we may preserve what you have entrusted to us; through Jesus Christ our Lord. Amen." },

  // FOR THE POOR AND NEGLECTED
  { category: "For the Poor and Neglected", title: "For the Poor and Neglected",
    text: "Almighty and most merciful God, we remember before you all poor and neglected persons whom it would be easy for us to forget: the homeless and the destitute, the old and the sick, and all who have none to care for them. Help us to heal those who are broken in body or spirit, and to turn their sorrow into joy. Grant this, Father, for the love of your Son, who for our sake became poor, Jesus Christ our Lord. Amen." },
  { category: "For the Poor and Neglected", title: "For the Unemployed",
    text: "Heavenly Father, we remember before you those who suffer want and anxiety from lack of work. Guide the people of this land so to use our public and private wealth that all may find suitable and fulfilling employment, and receive just payment for their labor; through Jesus Christ our Lord. Amen." },
  { category: "For the Poor and Neglected", title: "For Schools and Colleges",
    text: "O Eternal God: Bless all schools, colleges, and universities, that they may be lively centers for sound learning, new discovery, and the pursuit of wisdom; and grant that those who teach and those who learn may find you to be the source of all truth; through Jesus Christ our Lord. Amen." },
  { category: "For the Poor and Neglected", title: "For the Right Use of God's Gifts",
    text: "Almighty God, whose loving hand has given us all that we possess: Grant us grace that we may honor you with our substance, and, remembering the account which we must one day give, may be faithful stewards of your bounty; through Jesus Christ our Lord. Amen." },
  { category: "For the Poor and Neglected", title: "For those who Influence Public Opinion",
    text: "Almighty God, you proclaim your truth in every age by many voices: Direct, in our time, we pray, those who speak where many listen and write what many read; that they may do their part in making the heart of this people wise, its mind sound, and its will righteous; to the honor of Jesus Christ our Lord. Amen." },

  // FOR THE SICK
  { category: "For the Sick", title: "For the Sick (general)",
    text: "Heavenly Father, giver of life and health: Comfort and relieve your sick servants, and give your power of healing to those who minister to their needs, that those for whom our prayers are offered may be strengthened in their weakness and have confidence in your loving care; through Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen." },
  { category: "For the Sick", title: "For a Sick Person",
    text: "O Father of mercies and God of all comfort, our only help in time of need: We humbly beseech you to behold, visit, and relieve your sick servant for whom our prayers are desired. Look upon them with the eyes of your mercy; comfort them with a sense of your goodness; preserve them from the temptations of the enemy; and give them patience under their affliction. In your good time, restore them to health, and enable them to lead the residue of their life in your fear, and to your glory; and grant that finally they may dwell with you in life everlasting; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For a Sick Child",
    text: "Heavenly Father, watch with us over your child _____, and grant that they may be restored to that perfect health which it is yours alone to give; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For Recovery from Sickness",
    text: "O God, the strength of the weak and the comfort of sufferers: Mercifully accept our prayers, and grant to your servant _____ the help of your power, that their sickness may be turned into health, and our sorrow into joy; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For the Sanctification of Illness",
    text: "Sanctify, O Lord, the sickness of your servant _____, that the sense of their weakness may add strength to their faith and seriousness to their repentance; and grant that they may live with you in everlasting life; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For Health of Body and Soul",
    text: "May God the Father bless you, God the Son heal you, God the Holy Spirit give you strength. May God the holy and undivided Trinity guard your body, save your soul, and bring you safely to his heavenly country; where he lives and reigns for ever and ever. Amen." },
  { category: "For the Sick", title: "For one about to undergo an Operation",
    text: "Almighty God our heavenly Father, graciously comfort your servant _____ in their suffering, and bless the means made use of for their cure. Fill their heart with confidence that, though at times they may be afraid, they yet may put their trust in you; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For one who is Mentally Ill",
    text: "Gracious God, we pray for those who suffer from mental illness and for all who care for them. Give them courage and hope in their troubles; and grant that they may find relief from pain and lasting health of mind; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For Strength and Confidence",
    text: "Heavenly Father, giver of life and health: Grant to all the sick and suffering such a sense of your presence, that their minds may be made easy, and their hearts at rest; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For one who is near Death",
    text: "Almighty God, look on this your servant, lying in great weakness, and comfort them with the promise of life everlasting, given in the resurrection of your Son Jesus Christ our Lord. Amen." },

  // FOR THE SORROWING
  { category: "For the Sorrowing", title: "Comfort and Relief",
    text: "O merciful Father, who has taught us in your holy Word that you do not willingly afflict or grieve the children of men: Look with pity upon the sorrows of your servants for whom our prayers are offered. Remember them, O Lord, in mercy; nourish their souls with patience; comfort them with a sense of your goodness; lift up your countenance upon them; and give them peace; through Jesus Christ our Lord. Amen." },
  { category: "For the Sorrowing", title: "For the Bereaved",
    text: "Almighty God, Father of mercies and giver of comfort: Deal graciously, we pray, with all who mourn; that, casting every care on you, they may know the consolation of your love; through Jesus Christ our Lord. Amen." },
  { category: "For the Sorrowing", title: "For the Victims of Addiction",
    text: "O blessed Lord, you ministered to all who came to you: Look with compassion upon all who through addiction have lost their health and freedom. Restore to them the assurance of your unfailing mercy; remove from them the fears that beset them; strengthen them in the work of their recovery; and to those who care for them, give patient understanding and persevering love; through Jesus Christ our Lord. Amen." },
  { category: "For the Sorrowing", title: "For those Contemplating Suicide",
    text: "O God, our Father, in whom we live and move and have our being: Look with compassion on all who are overcome by hopelessness and despair. Revive in them the assurance of your saving love; grant that, finding in you a present help in their trouble, they may choose life, and, trusting in your mercy, face the challenges before them; through Jesus Christ our Lord. Amen." },
  { category: "For the Sorrowing", title: "For those who Mourn",
    text: "O Lord, you are the comforter of those who weep: Be close to all whose hearts are heavy with grief. Grant that, finding in you a present help in trouble, they may have strength for this day, hope for tomorrow, and peace within; through Jesus Christ our Lord. Amen." },

  // FOR THOSE IN NEED
  { category: "For Those in Need", title: "For an Anxious Person",
    text: "O God of peace, who has taught us that in returning and rest we shall be saved, in quietness and in confidence shall be our strength: By the might of your Spirit lift us, we pray, to your presence, where we may be still and know that you are God; through Jesus Christ our Lord. Amen." },
  { category: "For Those in Need", title: "For those who are Homeless",
    text: "Almighty and most merciful God, we remember before you all poor and neglected persons: the homeless and the destitute, the old and the sick, and all who have none to care for them. Help us to heal those who are broken in body or spirit, and to turn their sorrow into joy. Grant this, Father, for the love of your Son, who for our sake became poor, Jesus Christ our Lord. Amen." },
  { category: "For Those in Need", title: "For those in Prison",
    text: "Lord Jesus, for our sake you were condemned as a criminal: Visit our jails and prisons with your pity and judgment. Remember all prisoners, and bring the guilty to repentance and amendment of life according to your will, and give them hope for their future. When any are held unjustly, bring them release; forgive us, and teach us to improve our justice. Remember those who work in these institutions; keep them humane and compassionate; and save them from becoming brutal or callous. And since what we do for those in prison, O Lord, we do for you, constrain us to improve their lot. All this we ask for your mercy's sake. Amen." },
  { category: "For Those in Need", title: "For those in Trouble or Bereavement",
    text: "O merciful Father, who has taught us in your holy Word that you do not willingly afflict or grieve the children of men: Look with pity upon the sorrows of your servants for whom our prayers are offered. Remember them, O Lord, in mercy, nourish their souls with patience, comfort them with a sense of your goodness, lift up your countenance upon them, and give them peace; through Jesus Christ our Lord. Amen." },
  { category: "For Those in Need", title: "For those we Love",
    text: "O gracious Father, we humbly ask for your gentle care for the person we pray for now. Keep them ever in your love; teach them to love you with all their heart, with all their soul, with all their mind, and with all their strength; and, loving you, to love also all whom you love; through Jesus Christ our Lord. Amen." },

  // FOR SOCIAL JUSTICE
  { category: "For Social Justice", title: "For Social Justice",
    text: "Grant, O God, that your holy and life-giving Spirit may so move every human heart, and especially the hearts of the people of this land, that barriers which divide us may crumble, suspicions disappear, and hatreds cease; that our divisions being healed, we may live in justice and peace; through Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For the Poor and Oppressed",
    text: "O God, who created all peoples in your image, we thank you for the wonderful diversity of races and cultures in this world. Take away all things which make us afraid of one another; help us to know that we are all your children; and enable us to grow in brotherhood and sisterhood; through your Son, Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For Prisons and Correctional Institutions",
    text: "Lord Jesus, for our sake you were condemned as a criminal: Visit our jails and prisons with your pity and judgment. Remember all prisoners, and bring the guilty to repentance and amendment of life according to your will, and give them hope for their future. When any are held unjustly, bring them release; forgive us, and teach us to improve our justice. Remember those who work in these institutions; keep them humane and compassionate; and save them from becoming brutal or callous. All this we ask for your mercy's sake. Amen." },
  { category: "For Social Justice", title: "For those who are Alone and Lonely",
    text: "Almighty God, whose Son had nowhere to lay his head: Grant that those who live alone may not be lonely in their solitude, but that, following in his steps, they may find fulfillment in loving you and their neighbors; through Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For Young Persons",
    text: "God our Father, you see your children growing up in an unsteady and confusing world: Show them that your ways give more life than the ways of the world, and that following you is better than chasing after selfish goals. Help them to take failure, not as a measure of their worth, but as a chance for a new start. Give them strength to hold their faith in you, and to keep alive their joy in your creation; through Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For the Aged",
    text: "Look with mercy, O God our Father, on all whose increasing years bring them weakness, distress, or isolation. Provide for them homes of dignity and peace; give them understanding helpers, and the willingness to accept help; and, as their strength diminishes, increase their faith and their assurance of your love. This we ask in the name of Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For those in Military Service",
    text: "Almighty God, we commend to your gracious care and keeping all the men and women of our armed forces at home and abroad. Defend them day by day with your heavenly grace; strengthen them in their trials and temptations; give them courage to face the perils which beset them; and grant them a sense of your abiding presence wherever they may be; through Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "In Times of Great Suffering or Need",
    text: "O Lord, you have taught us that without love all our deeds are worth nothing: Send your Holy Spirit and pour into our hearts that most excellent gift of love, the true bond of peace and all virtue, without which whoever lives is counted dead before you. Grant this for the love of your only Son, Jesus Christ our Lord. Amen." },

  // FOR THE ENVIRONMENT
  { category: "For the Environment", title: "For the Care of Creation",
    text: "We call on you, O God, for our home the earth, that we may be worthy of it. We call on you, O God, for the health of the earth so that we may live with gratitude in it. We call on you, O God, for those who share the earth, that we may live with reverence for it. We call on you, O God, for those who will inherit the earth, that we may leave it to them as a gift. Through Christ who came that we might have life. Amen." },
  { category: "For the Environment", title: "For Conservation of Natural Resources",
    text: "Almighty God, in giving us dominion over things on earth, you made us fellow workers in your creation: Give us wisdom and reverence so to use the resources of nature, that no one may suffer from our abuse of them, and that generations yet to come may continue to praise you for your bounty; through Jesus Christ our Lord. Amen." },
  { category: "For the Environment", title: "For the Harvest of Lands and Waters",
    text: "O gracious Father, who opens your hand and fills all living things: Bless the lands and waters, and multiply the harvests of the world; let your Spirit go forth, that it may renew the face of the earth; show your loving-kindness, that our land may give her increase; and save us from selfish use of what you give, that men and women everywhere may give you thanks; through Christ our Lord. Amen." },
  { category: "For the Environment", title: "For the Future of the Human Race",
    text: "O God our heavenly Father, you have blessed us and given us dominion over all the earth: Increase our reverence before the mystery of life; and give us new insight into your purposes for the human race, and for the world you have made, that we may preserve what you have entrusted to us; through Jesus Christ our Lord. Amen." },

  // FOR THE CITY
  { category: "For the City", title: "For a City",
    text: "Heavenly Father, in your Word you have given us a vision of that holy City to which the nations of the world bring their glory: Behold and visit, we pray, the cities of the earth. Renew the ties of mutual regard which form our civic life. Send us honest and able leaders. Enable us to eliminate poverty, prejudice, and oppression, that peace may prevail with righteousness, and justice with order, and that men and women from different cultures and with differing talents may find with one another the fulfillment of their humanity; through Jesus Christ our Lord. Amen." },
  { category: "For the City", title: "For Towns and Rural Areas",
    text: "Lord Christ, when you came among us, you proclaimed the kingdom of God in villages, towns, and lonely places: Grant that your presence and power may be known throughout this land. Have mercy upon all of us who live and work in rural areas; and grant that all the people of our nation may give thanks to you for food and drink and all other bodily necessities of life, respect those who labor to produce them, and honor the land and the water from which these good things come. All this we ask in your holy Name. Amen." },
  { category: "For the City", title: "For Travelers",
    text: "O God, our heavenly Father, whose glory fills the whole creation, and whose presence we find wherever we go: Preserve those who travel; surround them with your loving care; protect them from every danger; and bring them in safety to their journey's end; through Jesus Christ our Lord. Amen." },
  { category: "For the City", title: "For those who Live Alone",
    text: "Almighty God, whose Son had nowhere to lay his head: Grant that those who live alone may not be lonely in their solitude, but that, following in his steps, they may find fulfillment in loving you and their neighbors; through Jesus Christ our Lord. Amen." },

  // FOR FAMILIES
  { category: "For Families", title: "For Families",
    text: "Almighty God, our heavenly Father, who sets the solitary in families: We commend to your continual care the homes in which your people dwell. Put far from them, we beseech you, every root of bitterness, the desire of vainglory, and the pride of life. Fill them with faith, virtue, knowledge, temperance, patience, godliness. Knit together in constant affection those who, in holy wedlock, have been made one flesh. Turn the hearts of the parents to the children, and the hearts of the children to the parents; and so enkindle fervent charity among us all, that we may evermore be kindly affectioned one to another; through Jesus Christ our Lord. Amen." },
  { category: "For Families", title: "For the Care of Children",
    text: "Almighty God, heavenly Father, you have blessed us with the joy and care of children: Give us calm strength and patient wisdom as we bring them up, that we may teach them to love whatever is just and true and good, following the example of our Savior Jesus Christ. Amen." },
  { category: "For Families", title: "For Young Persons",
    text: "God our Father, you see your children growing up in an unsteady and confusing world: Show them that your ways give more life than the ways of the world, and that following you is better than chasing after selfish goals. Help them to take failure, not as a measure of their worth, but as a chance for a new start. Give them strength to hold their faith in you, and to keep alive their joy in your creation; through Jesus Christ our Lord. Amen." },
  { category: "For Families", title: "For those who are Alone",
    text: "Almighty God, whose Son had nowhere to lay his head: Grant that those who live alone may not be lonely in their solitude, but that, following in his steps, they may find fulfillment in loving you and their neighbors; through Jesus Christ our Lord. Amen." },
];

// ─── Templates ───────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "morning-prayer", emoji: "🌅", name: "Morning Prayer",
    desc: "Open the day together in prayer",
    prefill: {
      name: "Morning Prayer 🌅",
      intention: "We open the day together. Before the world begins, we pray.",
      loggingType: "checkin" as LoggingType,
      reflectionPrompt: "",
      scheduledHour: 7, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "evening-prayer", emoji: "🌙", name: "Evening Prayer",
    desc: "Close the day together before rest",
    prefill: {
      name: "Evening Prayer 🌙",
      intention: "Before we rest, we release the day together. We pray.",
      loggingType: "checkin" as LoggingType,
      reflectionPrompt: "",
      scheduledHour: 9, scheduledAmPm: "PM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "intercession", emoji: "🙏", name: "Intercession",
    desc: "Hold a shared prayer for something that matters",
    prefill: {
      name: "Intercession 🙏",
      intention: "",
      loggingType: "reflection" as LoggingType,
      reflectionPrompt: "What are you holding today?",
      scheduledHour: 8, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "contemplative", emoji: "🕯️", name: "Contemplative Prayer",
    desc: "Sit together in stillness and silence",
    prefill: {
      name: "Contemplative Prayer 🕯️",
      intention: "We sit together in the silence. No agenda. Just presence.",
      loggingType: "checkin" as LoggingType,
      reflectionPrompt: "",
      scheduledHour: 7, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "fasting", emoji: "🍃", name: "Fasting",
    desc: "Fast together as a shared discipline",
    prefill: {
      name: "Fasting 🍃",
      intention: "We fast together — not alone. A shared discipline, a shared surrender.",
      loggingType: "checkin" as LoggingType,
      reflectionPrompt: "",
      scheduledHour: 8, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "weekly" as Frequency,
    },
  },
  {
    id: "custom", emoji: "🌱", name: "Begin from stillness",
    desc: "Create your own practice from scratch",
    prefill: null,
  },
];

// ─── Milestone goal options ───────────────────────────────────────────────────
const GOAL_OPTIONS = [
  {
    days: 3, emoji: "🌱", label: "Three days", sub: "A first tender",
    bg: "#EEF3EF", borderColor: "#c8dac9",
    dots: Array(3).fill(0), dotLabel: "3 practices together",
    badge: null,
    message: "A gentle beginning. Three practices to find your rhythm.",
  },
  {
    days: 7, emoji: "🌿", label: "One week", sub: "Taking root",
    bg: "#E4EEE6", borderColor: "#b0cdb3",
    dots: Array(7).fill(0), dotLabel: "7 practices together",
    badge: "Most chosen 🌿",
    message: "One week of showing up together. This is where something real begins.",
  },
  {
    days: 14, emoji: "🌸", label: "Two weeks", sub: "In bloom — then renew",
    bg: "#F7F0E6", borderColor: "#b0cdb3",
    dots: Array(14).fill(0), dotLabel: "14 practices — then your circle renews the commitment",
    badge: null, accentBar: true,
    message: "Two weeks. If you reach it, Eleanor will ask you to renew. The practice stays alive.",
  },
  {
    days: 0, emoji: "✨", label: "Just begin", sub: "No goal, tend freely",
    bg: "#FAF6F0", borderColor: "rgba(0,0,0,0.06)",
    dots: [], dotLabel: "",
    badge: null,
    message: "No pressure. The practice is open. Tend it when you can.",
  },
];

// ─── Logging type options ─────────────────────────────────────────────────────
const LOGGING_OPTIONS: { type: LoggingType; icon: string; label: string; description: string }[] = [
  { type: "photo",      icon: "📸", label: "Photo",      description: "Capture a moment to share with the group" },
  { type: "reflection", icon: "✍️", label: "Reflection",  description: "A written response to a prompt" },
  { type: "both",       icon: "📸✍️", label: "Photo + Reflection", description: "Share a photo and a written reflection" },
  { type: "checkin",    icon: "✅", label: "Just show up", description: "No words needed. Mark that you were present." },
];

// ─── Contact search hook ──────────────────────────────────────────────────────
function useContactSearch(query: string) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 2) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        setSuggestions(res.ok ? await res.json() : []);
      } catch { setSuggestions([]); }
      finally { setIsLoading(false); }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return { suggestions, isLoading, clearSuggestions: () => setSuggestions([]) };
}

// ─── Person row ───────────────────────────────────────────────────────────────
function PersonRow({ person, index, showRemove, onUpdate, onRemove, onSelect }: {
  person: { name: string; email: string }; index: number; showRemove: boolean;
  onUpdate: (i: number, f: "name" | "email", v: string) => void;
  onRemove: (i: number) => void;
  onSelect: (i: number, c: ContactSuggestion) => void;
}) {
  const [activeField, setActiveField] = useState<"name" | "email" | null>(null);
  const [justSelected, setJustSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchQuery = activeField === "name" ? person.name : activeField === "email" ? person.email : "";
  const { suggestions, isLoading, clearSuggestions } = useContactSearch(justSelected ? "" : searchQuery);

  const handleSelect = useCallback((contact: ContactSuggestion) => {
    setJustSelected(true); setActiveField(null); clearSuggestions();
    onSelect(index, contact);
    setTimeout(() => setJustSelected(false), 500);
  }, [index, onSelect, clearSuggestions]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveField(null); clearSuggestions();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clearSuggestions]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input type="text" value={person.name}
            onChange={e => { setJustSelected(false); onUpdate(index, "name", e.target.value); }}
            onFocus={() => setActiveField("name")}
            placeholder="Name" autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        <div className="relative flex-[1.5]">
          <input type="email" value={person.email}
            onChange={e => { setJustSelected(false); onUpdate(index, "email", e.target.value); }}
            onFocus={() => setActiveField("email")}
            placeholder="Email" autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        {showRemove && (
          <button onClick={() => onRemove(index)} className="text-muted-foreground hover:text-destructive transition-colors text-lg px-1">×</button>
        )}
      </div>
      {(suggestions.length > 0 || isLoading) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {isLoading && <div className="px-4 py-3 text-sm text-muted-foreground">Searching...</div>}
          {suggestions.map((s, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
              className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0">
              <span className="font-medium text-sm">{s.name}</span>
              <span className="text-muted-foreground text-xs ml-2">{s.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BCP Prayer List ──────────────────────────────────────────────────────────
function BcpPrayerList({ onSelect }: { onSelect: (prayer: BcpPrayer) => void }) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const grouped = BCP_PRAYERS.reduce<Record<string, BcpPrayer[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
      {Object.entries(grouped).map(([cat, prayers]) => (
        <div key={cat} className="border border-border/40 rounded-xl overflow-hidden">
          <button
            className="w-full text-left px-4 py-3 flex items-center justify-between bg-secondary/20 hover:bg-secondary/40 transition-colors"
            onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
          >
            <span className="text-sm font-semibold text-foreground">{cat}</span>
            <span className="text-muted-foreground text-xs ml-2 shrink-0">{expandedCat === cat ? "▲" : "▼"}</span>
          </button>
          {expandedCat === cat && (
            <div className="divide-y divide-border/20 bg-background">
              {prayers.map(p => (
                <button
                  key={p.title}
                  className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-secondary/20 transition-colors"
                  onClick={() => onSelect(p)}
                >
                  <span className="text-sm text-foreground">{p.title}</span>
                  <span className="text-muted-foreground/60 text-sm shrink-0 ml-2">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Milestone streak helper ──────────────────────────────────────────────────
export function milestoneLabel(streak: number): string {
  if (streak < 3) return `🌱 Day ${streak + 1} of 3`;
  if (streak < 7) return `🌱✓  🌿 Day ${streak + 1} of 7`;
  if (streak < 14) return `🌱✓  🌿✓  🌸 Day ${streak + 1} of 14`;
  return `🌸 14 days — ready to renew`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MomentNew() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // Intro splash (1.5s, first use only)
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem("eleanor_practice_intro_seen"));

  // Rotating examples for BCP intercession intention step
  const [exampleIdx, setExampleIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setExampleIdx(i => (i + 1) % INTERCESSION_EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (showIntro) {
      localStorage.setItem("eleanor_practice_intro_seen", "1");
      const t = setTimeout(() => setShowIntro(false), 1600);
      return () => clearTimeout(t);
    }
  }, [showIntro]);

  // Step navigation
  const [step, setStep] = useState<StepId>("template");
  const [done, setDone] = useState(false);
  const [createdMomentId, setCreatedMomentId] = useState<number | null>(null);

  // Template
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Intercession
  const [intercessionMode, setIntercessionMode] = useState<"choose" | "bcp" | "custom" | null>(null);
  const [intercessionTopic, setIntercessionTopic] = useState("");
  const [intercessionSource, setIntercessionSource] = useState<"bcp" | "custom">("custom");
  const [intercessionFullText, setIntercessionFullText] = useState("");
  const [selectedBcpPrayer, setSelectedBcpPrayer] = useState<BcpPrayer | null>(null);

  // Core fields
  const [name, setName] = useState("");
  const [intention, setIntention] = useState("");
  const [loggingType, setLoggingType] = useState<LoggingType>("reflection");
  const [reflectionPrompt, setReflectionPrompt] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [scheduledDays, setScheduledDays] = useState<string[]>([]);
  const [scheduledHour, setScheduledHour] = useState(8);
  const [scheduledMinute, setScheduledMinute] = useState(0);
  const [scheduledAmPm, setScheduledAmPm] = useState<"AM" | "PM">("AM");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);
  const [goalDays, setGoalDays] = useState(7);
  const [participants, setParticipants] = useState([{ name: "", email: "" }]);

  // ─── BCP-specific state (Morning Prayer / Evening Prayer) ────────────────────
  const [bcpFreqType, setBcpFreqType] = useState<BcpFreqType | null>(null);
  const [bcpPracticeDays, setBcpPracticeDays] = useState<string[]>([]);
  const [bcpTimeSlot, setBcpTimeSlot] = useState<"early-morning" | "morning" | "late-afternoon" | "evening" | null>(null);
  const [bcpPersonalHour, setBcpPersonalHour] = useState(8);
  const [bcpPersonalMinute, setBcpPersonalMinute] = useState(0);
  const [bcpPersonalAmPm, setBcpPersonalAmPm] = useState<"AM" | "PM">("AM");
  const [bcpTimezone, setBcpTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [bcpParticipants, setBcpParticipants] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [bcpConnections, setBcpConnections] = useState<{ name: string; email: string; invited: boolean }[]>([]);
  const [bcpConnectionsFetched, setBcpConnectionsFetched] = useState(false);
  const [bcpDone, setBcpDone] = useState(false);
  const [bcpCreatedToken, setBcpCreatedToken] = useState<string | null>(null);

  // Organizer personal time (after creation for spiritual templates)
  const [showPersonalTimePrompt, setShowPersonalTimePrompt] = useState(false);
  const [personalTimeDone, setPersonalTimeDone] = useState(false);
  const [personalHour, setPersonalHour] = useState(8);
  const [personalMinute, setPersonalMinute] = useState(0);
  const [personalAmPm, setPersonalAmPm] = useState<"AM" | "PM">("AM");
  const [personalTimezone, setPersonalTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const scheduledTime = (() => {
    let h = scheduledHour % 12;
    if (scheduledAmPm === "PM") h += 12;
    if (h === 12 && scheduledAmPm === "AM") h = 0;
    return `${String(h).padStart(2, "0")}:${String(scheduledMinute).padStart(2, "0")}`;
  })();

  const dayOfWeek = frequency === "weekly" && scheduledDays.length === 1 ? scheduledDays[0] : undefined;
  const isSpiritual = SPIRITUAL_TEMPLATES.has(templateId ?? "");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // ─── When personal time prompt opens, constrain hour/ampm to the selected time-of-day ──
  useEffect(() => {
    if (showPersonalTimePrompt && timeOfDay) {
      const c = TOD_CONSTRAINTS[timeOfDay];
      if (c) {
        setPersonalHour(c.defaultH);
        setPersonalAmPm(c.defaultAmPm);
      }
    }
  }, [showPersonalTimePrompt, timeOfDay]);

  // ─── For midday (mixed), auto-set AM/PM when hour changes ──────────────────
  useEffect(() => {
    if (timeOfDay === "midday") {
      if (personalHour === 11 || personalHour === 12) setPersonalAmPm("AM");
      else setPersonalAmPm("PM");
    }
  }, [personalHour, timeOfDay]);

  // ─── Template selection handler ─────────────────────────────────────────────
  function selectTemplate(t: typeof TEMPLATES[0]) {
    setTemplateId(t.id);
    // Morning Prayer and Evening Prayer use a completely separate BCP flow
    if (t.id === "morning-prayer" || t.id === "evening-prayer") {
      setStep("bcp-commitment");
      return;
    }
    if (t.prefill) {
      setName(t.prefill.name);
      setIntention(t.prefill.intention);
      setLoggingType(t.prefill.loggingType);
      setReflectionPrompt(t.prefill.reflectionPrompt);
      // No pre-filled time or day — user fills these in
      setFrequency(t.prefill.frequency);
    }
    if (t.id === "intercession") {
      setStep("intercession");
    } else {
      setStep("name");
    }
  }

  // ─── Intercession BCP selection ─────────────────────────────────────────────
  function selectBcpPrayer(prayer: BcpPrayer) {
    setSelectedBcpPrayer(prayer);
    setIntercessionTopic(prayer.title);
    setIntercessionSource("bcp");
    setIntercessionFullText(prayer.text);
    setName(prayer.title);
    setIntention("");
    setLoggingType("reflection");
    setReflectionPrompt("What are you holding today?");
    setIntercessionMode(null);
    setStep("intention");
  }

  function confirmCustomIntercession() {
    if (!intercessionTopic.trim()) return;
    setIntercessionSource("custom");
    setIntercessionFullText("");
    setIntention(`We hold this together in prayer. Today we intercede for: ${intercessionTopic.trim()}.`);
    setStep("name");
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const isBcpTemplate = templateId === "morning-prayer" || templateId === "evening-prayer";
  const BCP_STEP_ORDER: StepId[] = ["template", "bcp-commitment", "bcp-frequency", "bcp-time", "bcp-invite"];
  const STEP_ORDER: StepId[] = isBcpTemplate
    ? BCP_STEP_ORDER
    : templateId === "intercession"
      ? selectedBcpPrayer !== null
        ? ["template", "intercession", "intention", "intercession-frequency", "schedule", "goal", "invite"]
        : ["template", "intercession", "name", "intention", "logging", "intercession-frequency", "schedule", "goal", "invite"]
      : ["template", "name", "intention", "logging", "schedule", "goal", "invite"];

  function goNext() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
    else if (isBcpTemplate) handleSubmitBcp();
    else handleSubmit();
  }

  // Fetch existing connections when entering bcp-invite step
  useEffect(() => {
    if (step === "bcp-invite" && !bcpConnectionsFetched) {
      setBcpConnectionsFetched(true);
      apiRequest<{ connections: { name: string; email: string }[] }>("GET", "/api/connections")
        .then(r => {
          setBcpConnections(r.connections.map(c => ({ ...c, invited: false })));
        })
        .catch(() => {});
    }
  }, [step, bcpConnectionsFetched]);

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
    else setLocation("/create");
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length;

  // ─── Validation ─────────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === "template") return false;
    if (step === "intercession") return false;
    if (step === "bcp-commitment") return true;
    if (step === "bcp-frequency") {
      if (!bcpFreqType) return false;
      if (bcpFreqType !== "daily") return bcpPracticeDays.length === BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType)!.daysPerWeek;
      return true;
    }
    if (step === "bcp-time") {
      return bcpTimeSlot !== null;
    }
    if (step === "bcp-invite") return true;
    if (step === "name") return name.trim().length >= 2;
    if (step === "intention") return intention.trim().length >= 4;
    if (step === "logging") {
      if (loggingType === "reflection") return reflectionPrompt.trim().length >= 1;
      return true;
    }
    if (step === "intercession-frequency") {
      if (frequency === "weekly") return scheduledDays.length > 0;
      return true;
    }
    if (step === "schedule") {
      if (isSpiritual) return timeOfDay !== null;
      if (frequency === "weekly" && scheduledDays.length === 0) return false;
      return true;
    }
    if (step === "goal") return true;
    if (step === "invite") return true;
    return false;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────
  const plantMutation = useMutation({
    mutationFn: (data: object) => apiRequest<{ moment: { id: number; momentToken: string } }>("POST", "/api/moments", data),
    onSuccess: (data) => {
      setCreatedMomentId(data.moment.id);
      setDone(true);
      if (isSpiritual) setShowPersonalTimePrompt(true);
    },
  });

  // ─── BCP submit ──────────────────────────────────────────────────────────────
  const bcpPlantMutation = useMutation({
    mutationFn: (data: object) => apiRequest<{ moment: { id: number; momentToken: string } }>("POST", "/api/moments", data),
    onSuccess: (data) => {
      setBcpCreatedToken(data.moment.momentToken);
      // Save organizer personal time
      const h = (() => {
        let hh = bcpPersonalHour % 12;
        if (bcpPersonalAmPm === "PM") hh += 12;
        if (hh === 12 && bcpPersonalAmPm === "AM") hh = 0;
        return hh;
      })();
      const ptStr = `${String(h).padStart(2, "0")}:${String(bcpPersonalMinute).padStart(2, "0")}`;
      apiRequest("POST", `/api/moments/${data.moment.id}/personal-time`, {
        personalTime: ptStr,
        personalTimezone: bcpTimezone,
      }).catch(() => {});
      setBcpDone(true);
    },
  });

  function handleSubmitBcp() {
    const isMorning = templateId === "morning-prayer";
    const freqOpt = BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType);
    const daysPerWeek = freqOpt?.daysPerWeek ?? 7;
    const isDaily = bcpFreqType === "daily";
    const validParticipants = [
      ...bcpConnections.filter(c => c.invited),
      ...bcpParticipants.filter(p => p.name.trim() && p.email.trim()),
    ];

    // Build the scheduled time from bcpPersonalHour + bcpPersonalAmPm
    const h = (() => {
      let hh = bcpPersonalHour % 12;
      if (bcpPersonalAmPm === "PM") hh += 12;
      if (hh === 12 && bcpPersonalAmPm === "AM") hh = 0;
      return hh;
    })();
    const scheduledTimeStr = `${String(h).padStart(2, "0")}:${String(bcpPersonalMinute).padStart(2, "0")}`;

    bcpPlantMutation.mutate({
      name: isMorning ? "Morning Prayer 🌅" : "Evening Prayer 🌙",
      intention: isMorning
        ? "We open the day together. From the same book, in our own homes — but not alone."
        : "We close the day together. From the same book, in our own homes — but not alone.",
      loggingType: "checkin",
      templateType: templateId,
      frequency: isDaily ? "daily" : "weekly",
      scheduledTime: scheduledTimeStr,
      timezone: bcpTimezone,
      goalDays: 0,
      frequencyType: bcpFreqType,
      frequencyDaysPerWeek: daysPerWeek,
      practiceDays: isDaily ? "[]" : JSON.stringify(bcpPracticeDays),
      participants: validParticipants,
    });
  }

  const personalTimeMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest<{ ok: boolean }>("POST", `/api/moments/${createdMomentId}/personal-time`, data),
    onSuccess: () => {
      setShowPersonalTimePrompt(false);
      setPersonalTimeDone(true);
    },
  });

  function handleSubmit() {
    const validParticipants = participants.filter(p => p.name.trim() && p.email.trim());

    plantMutation.mutate({
      name: name.trim(),
      intention: intention.trim(),
      loggingType,
      reflectionPrompt: (loggingType === "reflection" || loggingType === "both")
        ? reflectionPrompt.trim() || undefined
        : undefined,
      templateType: templateId,
      intercessionTopic: intercessionTopic.trim() || undefined,
      intercessionSource: intercessionTopic.trim() ? intercessionSource : undefined,
      intercessionFullText: intercessionFullText.trim() || undefined,
      frequency,
      scheduledTime: isSpiritual ? "08:00" : scheduledTime,
      dayOfWeek,
      goalDays,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeOfDay: isSpiritual ? timeOfDay : undefined,
      participants: validParticipants,
    });
  }

  function handleSavePersonalTime() {
    let h = personalHour % 12;
    if (personalAmPm === "PM") h += 12;
    if (h === 12 && personalAmPm === "AM") h = 0;
    const ptStr = `${String(h).padStart(2, "0")}:${String(personalMinute).padStart(2, "0")}`;
    personalTimeMutation.mutate({ personalTime: ptStr, personalTimezone });
  }

  const sv = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };

  if (authLoading) return null;

  // ─── Done / Confirmation ──────────────────────────────────────────────────────
  if (done) {
    const templateInfo = TEMPLATES.find(t => t.id === templateId);
    const [h, m] = scheduledTime.split(":").map(Number);
    const timeLabel = new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const goalLabel = GOAL_OPTIONS.find(g => g.days === goalDays);
    const todEmoji = TIME_OF_DAY_OPTIONS.find(o => o.id === timeOfDay)?.emoji ?? "🌿";
    const todLabel = TIME_OF_DAY_OPTIONS.find(o => o.id === timeOfDay)?.label?.toLowerCase() ?? "morning";

    // ── Organizer personal time prompt (spiritual templates only) ────────────
    if (showPersonalTimePrompt) {
      return (
        <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-sm w-full text-[#F5EDD8]"
          >
            <div className="text-5xl mb-4 text-center">{todEmoji}</div>
            <h2 className="text-2xl font-semibold text-center mb-2">You've planted {["a","e","i","o","u"].includes(todLabel[0]) ? "an" : "a"} {todLabel} practice.</h2>
            <p className="text-[#c9b99a] text-center text-sm mb-8">
              When in the {todLabel} works best for you?
            </p>

            {(() => {
              const todC = timeOfDay ? TOD_CONSTRAINTS[timeOfDay] : null;
              const availableHours = todC ? todC.hours : [1,2,3,4,5,6,7,8,9,10,11,12];
              const amPmMode = todC ? todC.amPm : "mixed";
              return (
            <div className="bg-[#3a2410] rounded-2xl p-6 space-y-5">
              {/* Hour */}
              <div>
                <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">Hour</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {availableHours.map(hv => (
                    <button key={hv} onClick={() => setPersonalHour(hv)}
                      className={`py-2 rounded-lg border text-sm font-medium transition-all ${personalHour === hv ? "border-[#6B8F71] bg-[#6B8F71]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#6B8F71]/40"}`}>
                      {hv}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minute */}
              <div>
                <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">Minute</label>
                <div className="flex gap-2">
                  {[0, 15, 30, 45].map(mv => (
                    <button key={mv} onClick={() => setPersonalMinute(mv)}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${personalMinute === mv ? "border-[#6B8F71] bg-[#6B8F71]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#6B8F71]/40"}`}>
                      :{String(mv).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
              {/* AM/PM — show toggle only if mixed (midday); otherwise show label only */}
              {amPmMode === "mixed" ? (
                <div className="flex gap-3">
                  {(["AM", "PM"] as const).map(p => (
                    <button key={p} onClick={() => setPersonalAmPm(p)}
                      className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${personalAmPm === p ? "border-[#6B8F71] bg-[#6B8F71]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#6B8F71]/40"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center">
                  <span className="inline-block px-5 py-2 rounded-xl border border-[#6B8F71] bg-[#6B8F71]/20 text-[#9ecc9f] font-medium text-sm">
                    {amPmMode}
                  </span>
                </div>
              )}
              {/* Timezone */}
              <div>
                <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">Your timezone</label>
                <select value={personalTimezone} onChange={e => setPersonalTimezone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#2C1A0E] border border-[#5a3d28] text-[#F5EDD8] focus:border-[#6B8F71] focus:outline-none text-sm">
                  {Intl.supportedValuesOf("timeZone").map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-[#c9b99a]/60 italic text-center">
                This is when Eleanor will put it in your calendar.<br />
                Everyone in this practice chooses their own time.
              </p>
            </div>
              );
            })()}

            <button
              onClick={handleSavePersonalTime}
              disabled={personalTimeMutation.isPending}
              className="w-full mt-6 py-4 rounded-2xl bg-[#6B8F71] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
            >
              {personalTimeMutation.isPending ? "Saving..." : "Add to my calendar 🌿"}
            </button>
            {personalTimeMutation.isError && (
              <p className="text-xs text-red-400 text-center mt-2">Something went wrong. Please try again.</p>
            )}
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center text-[#F5EDD8]"
        >
          <div className="text-6xl mb-6">🌱</div>
          <h2 className="text-3xl font-semibold mb-3">{name} is planted.</h2>
          {isSpiritual && timeOfDay ? (
            <p className="text-[#c9b99a] mb-2">{frequency === "daily" ? "Every day" : "Weekly"} · {todEmoji} {todLabel} practice</p>
          ) : (
            <p className="text-[#c9b99a] mb-2">{frequency === "daily" ? "Every day" : frequency === "weekly" ? `Weekly` : "Monthly"} at {timeLabel}</p>
          )}
          {goalDays > 0 && goalLabel && (
            <p className="text-[#c9b99a] mb-6">{goalLabel.emoji} {goalLabel.label}</p>
          )}
          <p className="text-[#c9b99a] mb-8 text-sm leading-relaxed">
            Invites are on their way.<br />
            {isSpiritual ? "Each person will choose their own time." : "Eleanor will ring the bell when it's time."}<br />
            You just have to show up.
          </p>
          <button
            onClick={() => createdMomentId ? setLocation(`/moments/${createdMomentId}`) : setLocation("/moments")}
            className="px-8 py-3 bg-[#6B8F71] text-white rounded-full font-medium hover:bg-[#5a7a60] transition-colors"
          >
            Done 🌿
          </button>
        </motion.div>
      </div>
    );
  }

  // ── BCP Confirmation screen ─────────────────────────────────────────────────
  if (bcpDone) {
    const isMorning = templateId === "morning-prayer";
    const freqOpt = BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType);
    const freqLabel = freqOpt?.label ?? "Daily";
    return (
      <div className="min-h-screen bg-[#2C1810] flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center text-[#F7F0E6]">
          <div className="text-6xl mb-6">{isMorning ? "🌅" : "🌙"}</div>
          <h2 className="text-3xl font-bold mb-2">
            {isMorning ? "Morning Prayer is planted." : "Evening Prayer is planted."}
          </h2>
          <p className="text-[#F7F0E6]/70 mb-6">{freqLabel} · Everyone prays at their own time</p>
          <p className="text-sm text-[#F7F0E6]/60 mb-8">Calendar invites are on their way.</p>
          <div className="bg-[#F7F0E6]/10 border border-[#F7F0E6]/20 rounded-2xl p-5 mb-8 text-left">
            <p className="text-sm font-medium text-[#F7F0E6] mb-1">
              Open your BCP to page {isMorning ? "75" : "115"}.
            </p>
            <a href={isMorning ? "https://bcponline.org/MP2.html" : "https://bcponline.org/EP2.html"}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-[#6B8F71] underline underline-offset-2">
              Or pray online: {isMorning ? "bcponline.org/MP2.html" : "bcponline.org/EP2.html"}
            </a>
          </div>
          <p className="text-[#F7F0E6]/50 font-serif italic text-sm leading-relaxed mb-8">
            {isMorning
              ? '"Let my prayer be set forth in thy sight as incense, and the lifting up of my hands as the evening sacrifice." — Psalm 141:2'
              : '"O gracious Light, pure brightness of the everliving Father in heaven." — Phos Hilaron'}
          </p>
          <button onClick={() => setLocation("/moments")}
            className="px-10 py-4 bg-[#6B8F71] text-white rounded-full text-base font-semibold hover:bg-[#5a7a60] transition-colors">
            Done 🌿
          </button>
        </motion.div>
      </div>
    );
  }

  // ── BCP Commitment screen (full screen, soil bg) ─────────────────────────────
  if (step === "bcp-commitment" && isBcpTemplate) {
    const isMorning = templateId === "morning-prayer";
    return (
      <div className="min-h-screen bg-[#2C1810] flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full text-center text-[#F7F0E6]">
          <div className="text-6xl mb-6">{isMorning ? "🌅" : "🌙"}</div>
          <h1 className="text-3xl font-bold leading-tight mb-2">
            Plant {isMorning ? "Morning Prayer" : "Evening Prayer"}
          </h1>
          <p className="text-[#6B8F71] text-lg font-semibold mb-8">with your people</p>
          <p className="font-serif italic text-[#F7F0E6]/80 text-base leading-loose mb-8">
            {isMorning ? (
              <>
                "Morning Prayer is the first office of the day.<br />
                Prayed from the same book, in your own home<br />
                — but not alone.<br /><br />
                Your circle will pray the same words<br />
                at the same time, wherever they are.<br />
                That is what makes it fellowship."
              </>
            ) : (
              <>
                "Evening Prayer is the closing office of the day.<br />
                Prayed as the light changes, from the same book,<br />
                in your own home — but not alone.<br /><br />
                Your circle will pray the same words<br />
                at the same time, wherever they are.<br />
                That is what makes it fellowship."
              </>
            )}
          </p>
          <p className="text-[#F7F0E6]/50 text-sm mb-8">
            {isMorning ? "Morning Prayer Rite II" : "Evening Prayer Rite II"}<br />
            Book of Common Prayer · Page {isMorning ? "75" : "115"}
          </p>
          <button onClick={goNext}
            className="w-full py-4 rounded-2xl bg-[#6B8F71] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors">
            Plant this with my people 🌿
          </button>
          <button onClick={() => { setTemplateId(null); setStep("template"); }}
            className="mt-4 text-sm text-[#F7F0E6]/40 hover:text-[#F7F0E6]/70 transition-colors">
            ← Go back
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Practice intro splash (first use only) ──────────────────────────────────
  if (showIntro) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center min-h-[70vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-sm mx-auto"
          >
            <div className="bg-[#EEF3EF] border border-[#6B8F71]/20 rounded-[2rem] p-10 text-center shadow-[var(--shadow-warm-lg)]">
              <div className="text-5xl mb-5">🌿</div>
              <p className="text-[#2C1A0E] font-serif text-[1.1rem] leading-relaxed italic">
                "Practices are for the distance between gatherings.
                <br /><br />
                You're not in the same room — but you're doing the same thing, at the same time, together."
              </p>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pt-6 pb-16">

        {/* Header + progress */}
        {step !== "template" && (
          <div className="mb-8">
            <button onClick={goBack} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-6 transition-colors">
              ← {step === "name" ? "Templates" : "Previous"}
            </button>
            <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#6B8F71] rounded-full"
                animate={{ width: `${((stepIndex) / (totalSteps - 1)) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              />
            </div>
          </div>
        )}

        <div className={`bg-card rounded-[2rem] ${step === "template" ? "p-6 pt-8" : "p-8 md:p-12"} shadow-[var(--shadow-warm-lg)] border border-card-border min-h-[440px] flex flex-col`}>
          <AnimatePresence mode="wait">
            <motion.div key={step} variants={sv} initial="initial" animate="animate" exit="exit"
              transition={{ duration: 0.22 }} className="flex-1 flex flex-col">

              {/* ── Template selection ──────────────────────────── */}
              {step === "template" && (
                <div className="flex-1">
                  <div className="mb-5">
                    <h2 className="text-2xl font-semibold text-foreground mb-1">What will you tend together? 🌿</h2>
                    <p className="text-sm text-muted-foreground italic">Spiritual practices for when you can't be in the same place. Everything can be edited.</p>
                  </div>
                  <div className="grid gap-3">
                    {TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => selectTemplate(t)}
                        className="w-full text-left p-4 rounded-2xl border border-border/60 hover:border-[#6B8F71]/60 hover:bg-[#6B8F71]/5 transition-all flex items-center gap-4 group">
                        <span className="text-3xl">{t.emoji}</span>
                        <div>
                          <p className="font-semibold text-foreground text-sm group-hover:text-[#4a6b50]">{t.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                        </div>
                        <span className="ml-auto text-muted-foreground/40 text-sm">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Intercession sub-flow ───────────────────────── */}
              {step === "intercession" && (
                <div className="flex-1">
                  {intercessionMode === null && (
                    <>
                      <div className="mb-6">
                        <h2 className="text-2xl font-semibold mb-1">What will you hold in prayer together? 🙏</h2>
                        <p className="text-sm text-muted-foreground italic">Choose a prayer from the Book of Common Prayer, or name your own intention.</p>
                      </div>
                      <div className="grid gap-4">
                        <button onClick={() => setIntercessionMode("bcp")}
                          className="w-full text-left p-5 rounded-2xl border-2 border-border hover:border-[#6B8F71]/60 hover:bg-[#6B8F71]/5 transition-all">
                          <div className="flex items-start gap-4">
                            <span className="text-3xl">📖</span>
                            <div>
                              <p className="font-semibold text-foreground">From the Book of Common Prayer</p>
                              <p className="text-sm text-muted-foreground mt-0.5">Choose from the traditional intercessions</p>
                            </div>
                          </div>
                        </button>
                        <button onClick={() => setIntercessionMode("custom")}
                          className="w-full text-left p-5 rounded-2xl border-2 border-border hover:border-[#6B8F71]/60 hover:bg-[#6B8F71]/5 transition-all">
                          <div className="flex items-start gap-4">
                            <span className="text-3xl">✍️</span>
                            <div>
                              <p className="font-semibold text-foreground">Name your own intention</p>
                              <p className="text-sm text-muted-foreground mt-0.5">Write what your practice will hold together</p>
                            </div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}

                  {intercessionMode === "bcp" && (
                    <>
                      <div className="mb-4 flex items-center gap-2">
                        <button onClick={() => setIntercessionMode(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back</button>
                        <h2 className="text-lg font-semibold">Book of Common Prayer</h2>
                      </div>
                      <BcpPrayerList onSelect={selectBcpPrayer} />
                    </>
                  )}

                  {intercessionMode === "custom" && (
                    <>
                      <div className="mb-5 flex items-center gap-2">
                        <button onClick={() => setIntercessionMode(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back</button>
                        <h2 className="text-lg font-semibold">Name your intention</h2>
                      </div>
                      <label className="block text-sm text-muted-foreground mb-2">What are you praying for together?</label>
                      <textarea
                        value={intercessionTopic}
                        onChange={e => setIntercessionTopic(e.target.value.slice(0, 200))}
                        rows={4}
                        placeholder="The climate crisis and those most affected..."
                        className="w-full px-4 py-3 rounded-xl border border-border focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] focus:outline-none resize-none"
                      />
                      <p className="text-xs text-muted-foreground/60 text-right mt-1">{intercessionTopic.length}/200</p>
                      <div className="text-xs text-muted-foreground/60 italic mt-2 space-y-0.5">
                        <p>"The vulnerable, the forgotten, those who suffer 🌿"</p>
                        <p>"The earth and every living thing 🌱"</p>
                        <p>"Someone we love who is struggling"</p>
                      </div>
                      <button
                        onClick={confirmCustomIntercession}
                        disabled={!intercessionTopic.trim()}
                        className="mt-4 w-full py-3 bg-[#6B8F71] text-white rounded-xl font-medium hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
                      >
                        Set this intention →
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── BCP: How often ──────────────────────────────────── */}
              {step === "bcp-frequency" && (() => {
                const isMorning = templateId === "morning-prayer";
                const freqOpt = BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType);
                const requiredDays = freqOpt && freqOpt.id !== "daily" ? freqOpt.daysPerWeek : 0;
                return (
                  <div className="flex-1 space-y-4">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">How many times a week will you pray together? 🌿</h2>
                      <p className="text-sm text-muted-foreground italic">This is your commitment to each other. Choose what you can sustain.</p>
                    </div>
                    <div className="space-y-3">
                      {BCP_FREQ_OPTIONS.map(opt => {
                        const sel = bcpFreqType === opt.id;
                        const accentBar = opt.id === "five" || opt.id === "daily";
                        return (
                          <button key={opt.id} onClick={() => {
                            setBcpFreqType(opt.id);
                            if (opt.id === "daily") setBcpPracticeDays([]);
                            else setBcpPracticeDays([]);
                          }}
                            className="relative w-full text-left rounded-2xl overflow-hidden transition-all duration-200"
                            style={{ background: sel ? "#6B8F71" : opt.bg }}
                          >
                            {accentBar && !sel && (
                              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: opt.id === "five" ? "#6B8F71" : "#C17F24" }} />
                            )}
                            <div className={`flex items-center gap-4 px-5 py-4 ${accentBar && !sel ? "pl-6" : ""}`}>
                              <span className="text-3xl">{opt.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-bold text-base ${sel ? "text-[#F7F0E6]" : "text-[#2C1A0E]"}`}>{opt.label}</span>
                                  {opt.badge && !sel && (
                                    <span className="text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">{opt.badge}</span>
                                  )}
                                  {sel && <span className="ml-auto text-[#F7F0E6] text-lg">✓</span>}
                                </div>
                                <p className={`text-xs mt-0.5 ${sel ? "text-[#F7F0E6]/80" : "text-[#6b5c4a]/70"}`}>{opt.sub}</p>
                                <div className="flex gap-1 mt-2">
                                  {Array.from({ length: 7 }).map((_, i) => (
                                    <div key={i} className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                                      style={{ background: i < opt.dots ? (sel ? "#F7F0E6" : "#6B8F71") : "rgba(107,143,113,0.2)" }} />
                                  ))}
                                </div>
                                <p className={`text-xs mt-1 ${sel ? "text-[#F7F0E6]/60" : "text-[#6b5c4a]/50"}`}>
                                  {opt.dots} office{opt.dots > 1 ? "s" : ""} together each week
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {/* Dynamic message */}
                    {bcpFreqType && freqOpt && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-sm text-[#6B8F71] font-medium italic text-center py-2">
                        {freqOpt.message}
                      </motion.p>
                    )}
                    {/* Day selector for non-daily */}
                    {bcpFreqType && bcpFreqType !== "daily" && requiredDays > 0 && (
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                        <p className="text-sm font-medium text-foreground">Which days? 🌿</p>
                        <p className="text-xs text-muted-foreground">Choose {requiredDays} day{requiredDays > 1 ? "s" : ""}</p>
                        <div className="flex gap-2 flex-wrap">
                          {WEEK_DAYS.map(d => {
                            const sel = bcpPracticeDays.includes(d.id);
                            const atMax = bcpPracticeDays.length >= requiredDays && !sel;
                            return (
                              <button key={d.id}
                                disabled={atMax}
                                onClick={() => {
                                  if (sel) setBcpPracticeDays(prev => prev.filter(x => x !== d.id));
                                  else if (!atMax) setBcpPracticeDays(prev => [...prev, d.id]);
                                }}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                  sel ? "bg-[#6B8F71] text-white" : "bg-secondary text-foreground hover:bg-[#6B8F71]/10"
                                } ${atMax ? "opacity-30 cursor-not-allowed" : ""}`}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })()}

              {/* ── BCP: When in morning/evening ────────────────────── */}
              {step === "bcp-time" && (() => {
                const isMorning = templateId === "morning-prayer";
                const slots = isMorning
                  ? [
                      { id: "early-morning" as const, emoji: "🌅", label: "Early morning", sub: "Before the day begins", range: "5am – 8am", minH: 5, maxH: 8, defaultH: 6, defaultM: 0, amPm: "AM" as const },
                      { id: "morning" as const, emoji: "☀️", label: "Morning", sub: "As the day opens", range: "8am – 11am", minH: 8, maxH: 11, defaultH: 8, defaultM: 0, amPm: "AM" as const },
                    ]
                  : [
                      { id: "late-afternoon" as const, emoji: "🌤", label: "Late afternoon", sub: "Before the evening meal", range: "4pm – 7pm", minH: 4, maxH: 7, defaultH: 5, defaultM: 0, amPm: "PM" as const },
                      { id: "evening" as const, emoji: "🌙", label: "Evening", sub: "As the day releases", range: "7pm – 10pm", minH: 7, maxH: 10, defaultH: 7, defaultM: 0, amPm: "PM" as const },
                    ];
                const activeSlot = slots.find(s => s.id === bcpTimeSlot);
                return (
                  <div className="flex-1 space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">
                        {isMorning ? "When in the morning? 🌅" : "When in the evening? 🌙"}
                      </h2>
                      <p className="text-sm text-muted-foreground italic">
                        You choose your time. Everyone in this practice sets their own.<br />
                        You will all be praying at the same time of day, wherever you are.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {slots.map(s => {
                        const sel = bcpTimeSlot === s.id;
                        return (
                          <button key={s.id} onClick={() => {
                            setBcpTimeSlot(s.id);
                            setBcpPersonalHour(s.defaultH);
                            setBcpPersonalMinute(s.defaultM);
                            setBcpPersonalAmPm(s.amPm);
                          }}
                            className={`rounded-2xl p-4 text-left transition-all ${
                              sel ? "bg-[#6B8F71] text-white" : "bg-secondary/50 border border-border hover:border-[#6B8F71]/40"
                            }`}>
                            <div className="text-2xl mb-2">{s.emoji}</div>
                            <p className={`font-bold text-sm ${sel ? "text-white" : "text-foreground"}`}>{s.label}</p>
                            <p className={`text-xs mt-0.5 ${sel ? "text-white/70" : "text-muted-foreground"}`}>{s.sub}</p>
                            <p className={`text-xs mt-1 ${sel ? "text-white/60" : "text-muted-foreground/60"}`}>({s.range})</p>
                          </button>
                        );
                      })}
                    </div>
                    {/* Time picker constrained to slot range */}
                    {activeSlot && (
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                        <p className="text-sm font-medium text-foreground">Your time</p>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 bg-secondary/50 rounded-xl px-4 py-3 border border-border">
                            <button onClick={() => {
                              let h = bcpPersonalHour - 1;
                              if (h < activeSlot.minH) h = activeSlot.maxH - 1;
                              setBcpPersonalHour(h);
                            }} className="text-muted-foreground hover:text-foreground px-1">−</button>
                            <span className="text-xl font-bold w-8 text-center">{String(bcpPersonalHour).padStart(2, "0")}</span>
                            <button onClick={() => {
                              let h = bcpPersonalHour + 1;
                              if (h >= activeSlot.maxH) h = activeSlot.minH;
                              setBcpPersonalHour(h);
                            }} className="text-muted-foreground hover:text-foreground px-1">+</button>
                          </div>
                          <span className="text-xl font-bold text-muted-foreground">:</span>
                          <div className="flex items-center gap-1 bg-secondary/50 rounded-xl px-4 py-3 border border-border">
                            <button onClick={() => setBcpPersonalMinute(m => m === 0 ? 45 : m - 15)} className="text-muted-foreground hover:text-foreground px-1">−</button>
                            <span className="text-xl font-bold w-8 text-center">{String(bcpPersonalMinute).padStart(2, "0")}</span>
                            <button onClick={() => setBcpPersonalMinute(m => (m + 15) % 60)} className="text-muted-foreground hover:text-foreground px-1">+</button>
                          </div>
                          <span className="text-sm font-medium text-muted-foreground">{activeSlot.amPm}</span>
                        </div>
                        {/* Timezone */}
                        <div>
                          <label className="text-xs text-muted-foreground">Timezone</label>
                          <input type="text" value={bcpTimezone} onChange={e => setBcpTimezone(e.target.value)}
                            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:border-[#6B8F71] focus:outline-none" />
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })()}

              {/* ── BCP: Invite ──────────────────────────────────────── */}
              {step === "bcp-invite" && (() => {
                const isMorning = templateId === "morning-prayer";
                return (
                  <div className="flex-1 space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">Who will pray with you? 🌿</h2>
                      <p className="text-sm text-muted-foreground italic">
                        Invite someone to commit to this practice with you.<br />
                        They will choose their own time in the {isMorning ? "morning" : "evening"}.
                      </p>
                    </div>
                    {/* Autofill from existing connections */}
                    {bcpConnections.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">From your practices and traditions 🌿</p>
                        {bcpConnections.map((c, i) => (
                          <div key={i} className="flex items-center justify-between bg-secondary/30 border border-border/60 rounded-xl px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.email}</p>
                            </div>
                            <button onClick={() => setBcpConnections(prev => prev.map((x, j) => j === i ? { ...x, invited: !x.invited } : x))}
                              className={`text-sm font-medium rounded-full px-4 py-1.5 transition-all ${
                                c.invited ? "bg-[#6B8F71] text-white" : "border border-[#6B8F71] text-[#6B8F71] hover:bg-[#6B8F71]/10"
                              }`}>
                              {c.invited ? "Invited ✓" : "+ Invite"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Manual invite */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Invite by email</p>
                      {bcpParticipants.map((p, i) => (
                        <div key={i} className="flex gap-2">
                          <input type="text" value={p.name} onChange={e => setBcpParticipants(prev => { const n = [...prev]; n[i] = { ...n[i], name: e.target.value }; return n; })}
                            placeholder="Name" className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:border-[#6B8F71] focus:outline-none" />
                          <input type="email" value={p.email} onChange={e => setBcpParticipants(prev => { const n = [...prev]; n[i] = { ...n[i], email: e.target.value }; return n; })}
                            placeholder="Email" className="flex-[1.5] px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:border-[#6B8F71] focus:outline-none" />
                          {bcpParticipants.length > 1 && (
                            <button onClick={() => setBcpParticipants(prev => prev.filter((_, j) => j !== i))}
                              className="text-muted-foreground hover:text-destructive px-2">×</button>
                          )}
                        </div>
                      ))}
                      {bcpParticipants.length < 10 && (
                        <button onClick={() => setBcpParticipants(prev => [...prev, { name: "", email: "" }])}
                          className="text-sm text-[#6B8F71] hover:text-[#4a6b50] transition-colors">
                          + Add another person
                        </button>
                      )}
                    </div>
                    {/* BCP info card */}
                    <div className="bg-[#EEF3EF] border border-[#6B8F71]/20 rounded-2xl p-4 space-y-1">
                      <p className="text-sm font-semibold text-[#2C1A0E]">📖 About {isMorning ? "Morning Prayer" : "Evening Prayer"}</p>
                      <p className="text-sm text-[#6b5c4a]">
                        {isMorning ? "Morning Prayer Rite II takes 15–20 minutes." : "Evening Prayer Rite II takes 15–20 minutes."}<br />
                        It begins on page {isMorning ? "75" : "115"} of the Book of Common Prayer.
                      </p>
                      <a href={isMorning ? "https://bcponline.org/MP2.html" : "https://bcponline.org/EP2.html"}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm text-[#6B8F71] underline underline-offset-2 block">
                        No BCP? Pray online: {isMorning ? "bcponline.org/MP2.html" : "bcponline.org/EP2.html"}
                      </a>
                      <p className="text-xs text-[#6b5c4a]/70 italic mt-1">Everyone chooses their own time. You are together in spirit.</p>
                    </div>
                    {bcpPlantMutation.isError && (
                      <p className="text-xs text-destructive text-center">Something went wrong. Please try again.</p>
                    )}
                  </div>
                );
              })()}

              {/* ── Name ───────────────────────────────────────────── */}
              {step === "name" && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">What is this practice called?</h2>
                    <p className="text-muted-foreground text-sm">Pre-filled from your template — edit freely.</p>
                  </div>
                  <input autoFocus type="text" value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && canNext() && goNext()}
                    placeholder="Morning Prayer, Evening Coffee, Sunday Sit..."
                    className="w-full text-xl md:text-2xl px-0 py-4 bg-transparent border-b-2 border-border focus:border-[#6B8F71] focus:outline-none transition-colors placeholder:text-muted-foreground/40"
                  />
                </div>
              )}

              {/* ── Intention ──────────────────────────────────────── */}
              {step === "intention" && selectedBcpPrayer ? (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1.5">Who are you praying for? 🙏</h2>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      This is the intention your group will hold together. It appears when everyone opens their link.
                    </p>
                  </div>
                  <div className="relative">
                    <textarea autoFocus value={intention}
                      onChange={e => setIntention(e.target.value.slice(0, 200))}
                      rows={4}
                      className="w-full px-4 py-4 bg-card border-2 border-border focus:border-[#6B8F71] focus:outline-none transition-colors resize-none text-base placeholder:text-muted-foreground/40 font-serif rounded-2xl"
                    />
                    {intention.length > 150 && (
                      <p className="text-right text-xs text-muted-foreground/50 mt-1">{intention.length}/200</p>
                    )}
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={exampleIdx}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.4 }}
                      className="text-xs text-muted-foreground/50 italic"
                    >
                      e.g. "{INTERCESSION_EXAMPLES[exampleIdx]}"
                    </motion.p>
                  </AnimatePresence>
                  <div className="bg-[#F5EDD8] border border-[#c9b99a]/40 rounded-2xl overflow-hidden">
                    <details>
                      <summary className="px-4 py-3 text-xs font-semibold text-[#4a3728] cursor-pointer flex items-center gap-2 list-none">
                        📖 The full prayer
                      </summary>
                      <div className="px-4 pb-4 pt-1">
                        <p className="text-sm text-[#4a3728] italic leading-[1.85] font-serif">{selectedBcpPrayer.text}</p>
                        <p className="text-xs text-[#4a3728]/50 mt-3">From the Book of Common Prayer</p>
                      </div>
                    </details>
                  </div>
                </div>
              ) : step === "intention" && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">What is the intention?</h2>
                    <p className="text-muted-foreground text-sm">The first thing everyone reads when they open their link.</p>
                  </div>
                  <textarea autoFocus value={intention}
                    onChange={e => setIntention(e.target.value)}
                    maxLength={280} rows={3}
                    placeholder="Write what holds this practice together..."
                    className="w-full px-0 py-3 bg-transparent border-b-2 border-border focus:border-[#6B8F71] focus:outline-none transition-colors resize-none text-lg placeholder:text-muted-foreground/40 font-serif italic"
                  />
                  <p className="text-right text-xs text-muted-foreground/50">{intention.length}/280</p>
                </div>
              )}

              {/* ── Logging type ───────────────────────────────────── */}
              {step === "logging" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">How will your practice be held? 🌿</h2>
                    <p className="text-sm text-muted-foreground">Choose how members participate.</p>
                  </div>
                  <div className="grid gap-3">
                    {LOGGING_OPTIONS.map(opt => (
                      <button key={opt.type} onClick={() => setLoggingType(opt.type)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${loggingType === opt.type ? "border-[#6B8F71] bg-[#6B8F71]/5" : "border-border hover:border-[#6B8F71]/30"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{opt.icon}</span>
                          <div className="flex-1">
                            <p className="font-medium text-foreground text-sm">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.description}</p>
                          </div>
                          {loggingType === opt.type && <span className="text-[#6B8F71]">✓</span>}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Reflection prompt */}
                  {(loggingType === "reflection" || loggingType === "both") && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="block text-sm font-medium text-foreground mb-2">Your reflection prompt</label>
                      <input autoFocus type="text" value={reflectionPrompt}
                        onChange={e => setReflectionPrompt(e.target.value)}
                        placeholder="What are you carrying into this day?"
                        className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] focus:outline-none"
                      />
                    </motion.div>
                  )}
                </div>
              )}

              {/* ── Intercession Frequency ─────────────────────────── */}
              {step === "intercession-frequency" && (
                <div className="flex-1 space-y-5">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">How often will you pray together? 🙏</h2>
                    <p className="text-sm text-muted-foreground italic">This is your commitment to each other.</p>
                  </div>
                  <div className="space-y-3">
                    {/* Daily */}
                    <button
                      onClick={() => { setFrequency("daily"); setScheduledDays([]); }}
                      className={`w-full text-left rounded-2xl border-2 px-5 py-5 transition-all ${
                        frequency === "daily"
                          ? "border-[#6B8F71] bg-[#6B8F71]/8"
                          : "border-border hover:border-[#6B8F71]/50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">📅</span>
                        <div>
                          <p className="font-semibold text-foreground">Daily</p>
                          <p className="text-sm text-muted-foreground">Every day at your chosen time</p>
                        </div>
                        {frequency === "daily" && <span className="ml-auto text-[#6B8F71] text-lg">✓</span>}
                      </div>
                    </button>
                    {/* Weekly */}
                    <button
                      onClick={() => setFrequency("weekly")}
                      className={`w-full text-left rounded-2xl border-2 px-5 py-5 transition-all ${
                        frequency === "weekly"
                          ? "border-[#6B8F71] bg-[#6B8F71]/8"
                          : "border-border hover:border-[#6B8F71]/50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">🗓</span>
                        <div>
                          <p className="font-semibold text-foreground">Weekly</p>
                          <p className="text-sm text-muted-foreground">Choose which days of the week</p>
                        </div>
                        {frequency === "weekly" && <span className="ml-auto text-[#6B8F71] text-lg">✓</span>}
                      </div>
                    </button>
                  </div>
                  {/* Day picker for weekly */}
                  {frequency === "weekly" && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Which days?</p>
                      <div className="flex flex-wrap gap-2">
                        {[{ id: "MO", label: "Mon" }, { id: "TU", label: "Tue" }, { id: "WE", label: "Wed" },
                          { id: "TH", label: "Thu" }, { id: "FR", label: "Fri" }, { id: "SA", label: "Sat" }, { id: "SU", label: "Sun" }].map(d => {
                          const sel = scheduledDays.includes(d.id);
                          return (
                            <button key={d.id}
                              onClick={() => setScheduledDays(prev =>
                                sel ? prev.filter(x => x !== d.id) : [...prev, d.id]
                              )}
                              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                                sel
                                  ? "bg-[#6B8F71] text-white border-[#6B8F71]"
                                  : "border-border text-muted-foreground hover:border-[#6B8F71]/50"
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Schedule ───────────────────────────────────────── */}
              {step === "schedule" && (
                <div className="space-y-6 flex-1">
                  {isSpiritual ? (
                    <>
                      <div>
                        <h2 className="text-2xl font-semibold mb-1">When does this practice happen?</h2>
                        <p className="text-sm text-muted-foreground">Choose the time of day. Each person will set their own specific time.</p>
                      </div>

                      {/* Frequency */}
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">How often</label>
                        <div className="flex gap-3">
                          {(["daily", "weekly"] as Frequency[]).map(f => (
                            <button key={f} onClick={() => { setFrequency(f); if (f !== "weekly") setScheduledDays([]); }}
                              className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm capitalize transition-all ${frequency === f ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                              {f === "daily" ? "📅 Daily" : "🗓 Weekly"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Day pills for weekly */}
                      {frequency === "weekly" && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Which days</label>
                          <div className="flex flex-wrap gap-2">
                            {[["Mo","MO"],["Tu","TU"],["We","WE"],["Th","TH"],["Fr","FR"],["Sa","SA"],["Su","SU"]].map(([label, val]) => (
                              <button key={val} onClick={() => setScheduledDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val])}
                                className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${scheduledDays.includes(val) ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Time of day cards */}
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">Time of day</label>
                        <div className="grid gap-3">
                          {TIME_OF_DAY_OPTIONS.map(opt => (
                            <button key={opt.id} onClick={() => setTimeOfDay(opt.id)}
                              className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${timeOfDay === opt.id ? "border-[#6B8F71] bg-[#6B8F71]/5" : "border-border hover:border-[#6B8F71]/30"}`}>
                              <div className="flex items-center gap-4">
                                <span className="text-2xl">{opt.emoji}</span>
                                <div className="flex-1">
                                  <p className="font-semibold text-foreground text-sm">{opt.label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">"{opt.sub}"</p>
                                  <p className="text-xs text-muted-foreground/60 mt-0.5">{opt.range}</p>
                                </div>
                                {timeOfDay === opt.id && <span className="text-[#6B8F71]">✓</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground/60 italic">This describes the spirit of when the practice happens. Each person chooses their own specific time when they join.</p>
                    </>
                  ) : (
                    <>
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">When does the window open?</h2>
                    <p className="text-sm text-muted-foreground">Everyone has one hour to show up.</p>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">How often</label>
                    <div className="flex gap-3">
                      {(["daily", "weekly"] as Frequency[]).map(f => (
                        <button key={f} onClick={() => { setFrequency(f); if (f !== "weekly") setScheduledDays([]); }}
                          className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm capitalize transition-all ${frequency === f ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                          {f === "daily" ? "📅 Daily" : "🗓 Weekly"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day pills for weekly */}
                  {frequency === "weekly" && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Which days</label>
                      <div className="flex flex-wrap gap-2">
                        {[["Mo","MO"],["Tu","TU"],["We","WE"],["Th","TH"],["Fr","FR"],["Sa","SA"],["Su","SU"]].map(([label, val]) => (
                          <button key={val} onClick={() => setScheduledDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val])}
                            className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${scheduledDays.includes(val) ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Hour */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Hour</label>
                    <div className="grid grid-cols-6 gap-1.5">
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
                        <button key={h} onClick={() => setScheduledHour(h)}
                          className={`py-2 rounded-lg border text-sm font-medium transition-all ${scheduledHour === h ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/20 text-foreground"}`}>
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Minute */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Minute</label>
                    <div className="flex gap-2">
                      {[0, 15, 30, 45].map(m => (
                        <button key={m} onClick={() => setScheduledMinute(m)}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${scheduledMinute === m ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/20 text-foreground"}`}>
                          :{String(m).padStart(2, "0")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AM/PM */}
                  <div className="flex gap-3">
                    {(["AM", "PM"] as const).map(p => (
                      <button key={p} onClick={() => setScheduledAmPm(p)}
                        className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${scheduledAmPm === p ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/20 text-foreground"}`}>
                        {p}
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground/60 italic">Members receive calendar invites in their own timezone.</p>
                    </>
                  )}
                </div>
              )}

              {/* ── Goal ───────────────────────────────────────────── */}
              {step === "goal" && (
                <div className="flex-1 flex flex-col gap-4">
                  {/* Header */}
                  <div>
                    <h2 className="text-[1.6rem] font-bold text-[#2C1A0E] leading-tight mb-1">
                      How far will you grow together? 🌱
                    </h2>
                    <p className="text-sm text-muted-foreground italic">Pick a goal. Eleanor will tend it with you.</p>
                  </div>

                  {/* Goal cards */}
                  <div className="space-y-3">
                    {GOAL_OPTIONS.map(g => {
                      const selected = goalDays === g.days;
                      const isJustBegin = g.days === 0;
                      return (
                        <motion.button
                          key={g.days}
                          onClick={() => setGoalDays(g.days)}
                          animate={{ y: selected ? -2 : 0 }}
                          transition={{ duration: 0.15 }}
                          className="relative w-full text-left rounded-2xl overflow-hidden transition-colors duration-200"
                          style={{
                            background: selected ? "#6B8F71" : g.bg,
                            border: `1px solid ${selected ? "#6B8F71" : g.borderColor}`,
                            boxShadow: selected ? "0 4px 14px rgba(107,143,113,0.25)" : undefined,
                          }}
                        >
                          {/* Left accent bar for Two weeks */}
                          {"accentBar" in g && g.accentBar && !selected && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#6B8F71]/40 rounded-l-2xl" />
                          )}

                          {/* Badge — top right */}
                          {g.badge && !selected && (
                            <div className="absolute top-3 right-3 bg-[#C17F24] text-[#F5EDD8] text-[11px] px-2.5 py-0.5 rounded-full font-medium tracking-tight">
                              {g.badge}
                            </div>
                          )}

                          {/* Checkmark when selected */}
                          {selected && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute top-3 right-3 text-[#F5EDD8] font-bold text-base leading-none"
                            >
                              ✓
                            </motion.div>
                          )}

                          <div className={`flex items-start gap-4 p-5 ${!selected && "accentBar" in g && g.accentBar ? "pl-6" : ""}`}>
                            {/* Emoji */}
                            <span className="text-[40px] leading-none shrink-0 mt-0.5">{g.emoji}</span>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className={`font-bold text-[15px] leading-snug ${selected ? "text-[#F5EDD8]" : isJustBegin ? "text-muted-foreground font-normal" : "text-[#2C1A0E]"}`}>
                                {g.label}
                              </p>
                              <p className={`text-xs mt-0.5 ${selected ? "text-[#F5EDD8]/70" : "text-muted-foreground"}`}>
                                {g.sub}
                              </p>

                              {/* Progress dots — key forces remount & re-fires stagger on selection */}
                              {g.dots.length > 0 && (
                                <div key={`dots-${g.days}-${selected}`} className="mt-2.5">
                                  {/* Row 1 — up to 7 */}
                                  <div className="flex gap-1">
                                    {g.dots.slice(0, 7).map((_, i) => (
                                      <motion.div
                                        key={i}
                                        initial={selected ? { scale: 0.3, opacity: 0 } : false}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: selected ? i * 0.05 : 0, duration: 0.18, ease: "easeOut" }}
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ background: selected ? "rgba(247,240,230,0.85)" : "rgba(107,143,113,0.28)" }}
                                      />
                                    ))}
                                  </div>
                                  {/* Row 2 — for 14 */}
                                  {g.dots.length > 7 && (
                                    <div className="flex gap-1 mt-1">
                                      {g.dots.slice(7).map((_, i) => (
                                        <motion.div
                                          key={i}
                                          initial={selected ? { scale: 0.3, opacity: 0 } : false}
                                          animate={{ scale: 1, opacity: 1 }}
                                          transition={{ delay: selected ? (i + 7) * 0.05 : 0, duration: 0.18, ease: "easeOut" }}
                                          className="w-2.5 h-2.5 rounded-full"
                                          style={{ background: selected ? "rgba(247,240,230,0.85)" : "rgba(107,143,113,0.28)" }}
                                        />
                                      ))}
                                    </div>
                                  )}
                                  <p className={`text-[10px] mt-1.5 ${selected ? "text-[#F5EDD8]/55" : "text-muted-foreground/55"}`}>
                                    {g.dotLabel}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Dynamic message beneath cards */}
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={goalDays}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.2 }}
                      className="text-sm text-center text-muted-foreground italic px-2 pb-1"
                    >
                      {GOAL_OPTIONS.find(g => g.days === goalDays)?.message}
                    </motion.p>
                  </AnimatePresence>
                </div>
              )}

              {/* ── Invite ─────────────────────────────────────────── */}
              {step === "invite" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">Who will tend this practice with you? 🌿</h2>
                    <p className="text-sm text-muted-foreground">Each person gets their own link. No account needed to participate.</p>
                  </div>
                  <div className="space-y-3">
                    {participants.map((p, i) => (
                      <PersonRow key={i} person={p} index={i} showRemove={participants.length > 1}
                        onUpdate={(idx, f, v) => setParticipants(prev => { const n = [...prev]; n[idx][f] = v; return n; })}
                        onRemove={idx => setParticipants(prev => prev.filter((_, j) => j !== idx))}
                        onSelect={(idx, c) => setParticipants(prev => { const n = [...prev]; n[idx] = { name: c.name, email: c.email }; return n; })}
                      />
                    ))}
                  </div>
                  {participants.length < 19 && (
                    <button onClick={() => setParticipants(p => [...p, { name: "", email: "" }])}
                      className="text-sm text-[#6B8F71] hover:text-[#4a6b50] transition-colors flex items-center gap-1">
                      + Add another person
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground/60 italic mt-2">You can also add people later by sharing your practice link.</p>
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* ── Next button (not shown for template, intercession main, or bcp-commitment) ── */}
          {step !== "template" && step !== "intercession" && step !== "bcp-commitment" && (
            <div className="mt-6 pt-4 border-t border-border/30">
              <button
                onClick={goNext}
                disabled={!canNext() || plantMutation.isPending || bcpPlantMutation.isPending}
                className="w-full py-4 rounded-2xl bg-[#6B8F71] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
              >
                {(plantMutation.isPending || bcpPlantMutation.isPending)
                  ? "Planting..."
                  : step === "invite" || step === "bcp-invite"
                    ? "Plant this practice 🌿"
                    : "Continue →"}
              </button>
              {plantMutation.isError && (
                <p className="text-xs text-destructive text-center mt-2">Something went wrong. Please try again.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
