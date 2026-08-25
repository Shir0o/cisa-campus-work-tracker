// Gender (M/F) for a contact.
//
// When a contact is added we *auto-tag* their gender from their first name
// (best-effort lookup below) and store it in the `gender` field plus an "M"/"F"
// tag, so the prayer page's brother/sister filter (`isContactBrother` /
// `isContactSister` read `gender`) works without staff having to type it.
// The value is editable in the add/edit contact forms so staff can correct the
// guess. Unknown/ambiguous names fall through to `null` (no tag added).

export type Gender = "M" | "F";

const NAME_GENDER: Record<string, Gender> = {
  aaron: "M", abel: "M", abraham: "M", adam: "M", adrian: "M", aidan: "M", aiden: "M",
  alan: "M", albert: "M", alec: "M", alejandro: "M", alex: "M", alexander: "M", alfred: "M",
  ali: "M", allen: "M", alvin: "M", amir: "M", andrew: "M", andy: "M", angelo: "M",
  anthony: "M", antonio: "M", arthur: "M", austin: "M", barry: "M", ben: "M", benjamin: "M",
  bernard: "M", bill: "M", billy: "M", blake: "M", bob: "M", bobby: "M", brad: "M",
  bradley: "M", brandon: "M", brendan: "M", brent: "M", brett: "M", brian: "M", brock: "M",
  bruce: "M", bryan: "M", bryce: "M", caleb: "M", calvin: "M", cameron: "M", carl: "M",
  carlos: "M", carter: "M", casey: "M", cecil: "M", chad: "M", charles: "M", chase: "M",
  chris: "M", christian: "M", christopher: "M", clarence: "M", clark: "M", clay: "M",
  clifford: "M", clint: "M", cody: "M", colin: "M", connor: "M", corey: "M", craig: "M",
  curtis: "M", cyrus: "M", dale: "M", damian: "M", dan: "M", daniel: "M", danny: "M",
  darren: "M", dave: "M", david: "M", dean: "M", dennis: "M", derek: "M", derrick: "M",
  devin: "M", dexter: "M", diego: "M", dominic: "M", donald: "M", donovan: "M", doug: "M",
  douglas: "M", drew: "M", duane: "M", dustin: "M", dylan: "M", eddie: "M", edgar: "M",
  edmund: "M", edward: "M", edwin: "M", eli: "M", elias: "M", elijah: "M", elliot: "M",
  elvis: "M", emil: "M", emmanuel: "M", eric: "M", ernest: "M", ethan: "M", eugene: "M",
  evan: "M", felix: "M", fernando: "M", finn: "M", floyd: "M", francis: "M", francisco: "M",
  frank: "M", franklin: "M", fred: "M", freddie: "M", frederick: "M", gabriel: "M", gage: "M",
  gary: "M", gavin: "M", gene: "M", geoff: "M", george: "M", gerald: "M", gerard: "M",
  gilbert: "M", glen: "M", glenn: "M", gordon: "M", graham: "M", grant: "M", greg: "M",
  gregory: "M", guy: "M", hank: "M", harold: "M", harrison: "M", harry: "M", harvey: "M",
  hector: "M", henry: "M", herbert: "M", howard: "M", hugh: "M", hugo: "M", ian: "M",
  isaac: "M", isaiah: "M", ismael: "M", ivan: "M", jack: "M", jackson: "M", jacob: "M",
  jake: "M", jalen: "M", james: "M", jared: "M", jason: "M", jasper: "M", javier: "M",
  jay: "M", jeff: "M", jeffrey: "M", jeremiah: "M", jeremy: "M", jerome: "M", jerry: "M",
  jesse: "M", jesus: "M", jim: "M", jimmy: "M", joe: "M", joel: "M", john: "M",
  johnathan: "M", johnny: "M", jon: "M", jonah: "M", jonathan: "M", jordan: "M", jorge: "M",
  jose: "M", joseph: "M", josh: "M", joshua: "M", josiah: "M", juan: "M", judah: "M",
  julian: "M", justin: "M", karl: "M", keith: "M", kelvin: "M", ken: "M", kenneth: "M",
  kenny: "M", kevin: "M", kyle: "M", landon: "M", larry: "M", lawrence: "M", lee: "M",
  leo: "M", leon: "M", leonard: "M", leroy: "M", levi: "M", liam: "M", lincoln: "M",
  lloyd: "M", logan: "M", lonnie: "M", louis: "M", lucas: "M", luke: "M", luis: "M",
  malcolm: "M", manuel: "M", marc: "M", marcus: "M", mark: "M", marlon: "M", marshall: "M",
  martin: "M", marvin: "M", mason: "M", mathew: "M", matthew: "M", maurice: "M", max: "M",
  maxwell: "M", melvin: "M", michael: "M", micah: "M", miguel: "M", mike: "M", miles: "M",
  mitchell: "M", morris: "M", nathan: "M", nathaniel: "M", neil: "M", nelson: "M",
  nicholas: "M", nick: "M", nicolas: "M", noah: "M", noel: "M", norman: "M", oliver: "M",
  omar: "M", oscar: "M", owen: "M", patrick: "M", paul: "M", pedro: "M", perry: "M",
  pete: "M", peter: "M", philip: "M", phillip: "M", preston: "M", quentin: "M", ralph: "M",
  ramon: "M", randall: "M", randy: "M", raul: "M", ray: "M", raymond: "M", reese: "M",
  reginald: "M", reid: "M", rex: "M", ricardo: "M", richard: "M", rick: "M", ricky: "M",
  robert: "M", roberto: "M", rodney: "M", roger: "M", roland: "M", roman: "M", ron: "M",
  ronald: "M", ronnie: "M", ross: "M", roy: "M", rudy: "M", russell: "M", ryan: "M",
  salvatore: "M", sam: "M", sammy: "M", samuel: "M", santos: "M", scott: "M", sean: "M",
  sergio: "M", seth: "M", shane: "M", shawn: "M", sidney: "M", silas: "M", simon: "M",
  spencer: "M", stanley: "M", stefan: "M", stephen: "M", steve: "M", steven: "M",
  stewart: "M", stuart: "M", sylvester: "M", tanner: "M", ted: "M", terrence: "M", terry: "M",
  theo: "M", theodore: "M", thomas: "M", tim: "M", timothy: "M", tobias: "M", todd: "M",
  tom: "M", tommy: "M", tony: "M", travis: "M", trevor: "M", tristan: "M", troy: "M",
  tyler: "M", tyrone: "M", ulysses: "M", victor: "M", vincent: "M", walter: "M", warren: "M",
  wayne: "M", wesley: "M", william: "M", willie: "M", wilson: "M", winston: "M", zach: "M",
  zachary: "M", zane: "M",
  abigail: "F", ada: "F", addison: "F", adele: "F", adriana: "F", aisha: "F", alaina: "F",
  alana: "F", alexa: "F", alexandra: "F", alexis: "F", alice: "F", alicia: "F", alison: "F",
  allison: "F", amanda: "F", amber: "F", amelia: "F", amy: "F", ana: "F", anastasia: "F",
  andrea: "F", angela: "F", angelica: "F", anita: "F", ann: "F", anna: "F", anne: "F",
  annette: "F", annie: "F", antonia: "F", april: "F", ariana: "F", ariel: "F", ashley: "F",
  audrey: "F", autumn: "F", ava: "F", avery: "F", bailey: "F", barbara: "F", beatrice: "F",
  becky: "F", belinda: "F", bella: "F", bernadette: "F", beth: "F", bethany: "F", betsy: "F",
  betty: "F", beverly: "F", bianca: "F", bonnie: "F", brandy: "F", brenda: "F", briana: "F",
  brianna: "F", bridget: "F", brittany: "F", brooke: "F", brooklyn: "F", caitlin: "F",
  caitlyn: "F", callie: "F", camila: "F", candace: "F", cara: "F", carla: "F", carly: "F",
  carmen: "F", carol: "F", caroline: "F", carolyn: "F", carrie: "F", cassandra: "F",
  cassidy: "F", catherine: "F", cathy: "F", cecilia: "F", celeste: "F", charlene: "F",
  charlotte: "F", chelsea: "F", cheryl: "F", chloe: "F", christina: "F", christine: "F",
  cindy: "F", claire: "F", clara: "F", claudia: "F", constance: "F", cora: "F", courtney: "F",
  crystal: "F", cynthia: "F", daisy: "F", dana: "F", danielle: "F", daphne: "F", dawn: "F",
  deanna: "F", debbie: "F", deborah: "F", debra: "F", delia: "F", denise: "F", desiree: "F",
  diana: "F", diane: "F", dolores: "F", donna: "F", dorothy: "F", edna: "F", eileen: "F",
  elaine: "F", eleanor: "F", elena: "F", eliza: "F", elizabeth: "F", ella: "F", ellen: "F",
  ellie: "F", eloise: "F", emerson: "F", emily: "F", emma: "F", erin: "F", esther: "F",
  evelyn: "F", faith: "F", fiona: "F", florence: "F", frances: "F", francesca: "F",
  francine: "F", gabriela: "F", gabriella: "F", genevieve: "F", georgia: "F", geraldine: "F",
  gianna: "F", gina: "F", ginger: "F", gladys: "F", gloria: "F", grace: "F", gracie: "F",
  gretchen: "F", guadalupe: "F", gwen: "F", hailey: "F", hannah: "F", harriet: "F", hayley: "F",
  hazel: "F", heather: "F", heidi: "F", helen: "F", helena: "F", hope: "F", imani: "F",
  ingrid: "F", irene: "F", iris: "F", isabel: "F", isabella: "F", isabelle: "F", ivy: "F",
  jackie: "F", jacqueline: "F", jade: "F", jada: "F", jane: "F", janet: "F", janice: "F",
  jasmine: "F", jayla: "F", jean: "F", jeanette: "F", jeanne: "F", jennifer: "F", jenny: "F",
  jessica: "F", jill: "F", jillian: "F", joan: "F", joanna: "F", joanne: "F", jocelyn: "F",
  jodi: "F", jody: "F", josephine: "F", joy: "F", joyce: "F", judith: "F", judy: "F",
  julia: "F", juliana: "F", julie: "F", juliet: "F", juliette: "F", kaitlyn: "F", karen: "F",
  katherine: "F", kathleen: "F", kathryn: "F", kathy: "F", katie: "F", katrina: "F", kayla: "F",
  kaylee: "F", kelsey: "F", kendra: "F", kerri: "F", kerry: "F", kim: "F", kimberly: "F",
  kristen: "F", kristi: "F", kristin: "F", kristina: "F", krystal: "F", kylie: "F", lacey: "F",
  lana: "F", lara: "F", latoya: "F", laura: "F", lauren: "F", laurie: "F", leah: "F",
  leigh: "F", leila: "F", lena: "F", lillian: "F", lily: "F", linda: "F", lindsay: "F",
  lindsey: "F", lisa: "F", lois: "F", lola: "F", lora: "F", loretta: "F", lori: "F",
  louise: "F", lucia: "F", lucy: "F", lydia: "F", lynne: "F", mackenzie: "F", madeline: "F",
  madison: "F", maggie: "F", mandy: "F", mara: "F", marcia: "F", margaret: "F", margarita: "F",
  margie: "F", maria: "F", marian: "F", mariana: "F", marianne: "F", maribel: "F", marie: "F",
  marilyn: "F", marina: "F", marion: "F", marisa: "F", marissa: "F", marta: "F", martha: "F",
  mary: "F", maryann: "F", maureen: "F", maxine: "F", maya: "F", megan: "F", melanie: "F",
  melinda: "F", melissa: "F", melody: "F", meredith: "F", mia: "F", michele: "F",
  michelle: "F", mildred: "F", mindy: "F", miriam: "F", misty: "F", molly: "F", monica: "F",
  monique: "F", muriel: "F", myra: "F", nadia: "F", nancy: "F", naomi: "F", natalie: "F",
  natasha: "F", nicole: "F", nina: "F", noelle: "F", nora: "F", norma: "F", olivia: "F",
  opal: "F", pamela: "F", paola: "F", patricia: "F", patsy: "F", paula: "F", pauline: "F",
  pearl: "F", peggy: "F", penelope: "F", phyllis: "F", piper: "F", priscilla: "F", rachel: "F",
  rachael: "F", ramona: "F", raquel: "F", rebecca: "F", regina: "F", renee: "F", rhonda: "F",
  rita: "F", robin: "F", roberta: "F", robyn: "F", rosa: "F", rosalie: "F", rosalind: "F",
  rose: "F", rosemary: "F", roxanne: "F", ruby: "F", ruth: "F", sabrina: "F", sadie: "F",
  sally: "F", samantha: "F", sandra: "F", sandy: "F", sara: "F", sarah: "F", sasha: "F",
  savannah: "F", scarlet: "F", selena: "F", serena: "F", sharon: "F", shauna: "F", sheila: "F",
  shelby: "F", shelley: "F", sherri: "F", sherry: "F", shirley: "F", sierra: "F", simone: "F",
  skylar: "F", sofia: "F", sonia: "F", sophia: "F", sophie: "F", stacey: "F", stacy: "F",
  stella: "F", stephanie: "F", sue: "F", susan: "F", susanna: "F", suzanne: "F", sylvia: "F",
  tamara: "F", tammy: "F", tania: "F", tanya: "F", tara: "F", tatiana: "F", taylor: "F",
  teresa: "F", terri: "F", tessa: "F", thelma: "F", theresa: "F", tiffany: "F", tina: "F",
  tonya: "F", tracey: "F", tracy: "F", tricia: "F", trinity: "F", trudy: "F", valerie: "F",
  vanessa: "F", vera: "F", veronica: "F", vicki: "F", vickie: "F", victoria: "F", viola: "F",
  violet: "F", virginia: "F", vivian: "F", wanda: "F", wendy: "F", whitney: "F", willow: "F",
  yolanda: "F", yvonne: "F", zoe: "F", zoey: "F",
};

/** Normalize a raw gender value to "M", "F", or "" (unset). */
export function normalizeGender(value?: string | null): string {
  const v = (value || "").trim().toLowerCase();
  if (v === "m" || v === "male" || v === "man" || v === "boy" || v === "brother") return "M";
  if (v === "f" || v === "female" || v === "woman" || v === "girl" || v === "sister") return "F";
  return "";
}

/**
 * Best-effort gender inference from a full name (first token). Returns "M" or
 * "F" when the first name is in the lookup, else `null` — so unknown/ambiguous
 * names simply don't get an auto-tag and staff fill it in.
 */
export function inferGenderFromName(name?: string | null): Gender | null {
  const first = (name || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  if (!first) return null;
  return NAME_GENDER[first] ?? null;
}

/** The "M"/"F" tag a gender maps to (empty when unset). */
export function genderTag(gender?: string | null): string {
  return normalizeGender(gender);
}
