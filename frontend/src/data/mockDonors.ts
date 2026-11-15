
export type Donor = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  email: string;
  phone: string;
  donor_type: "individual" | "funder";
  owner: string;
  total_donated: number;
  last_thanked_at: string | null;
  active: boolean;
  gifts: {
    id: number;
    amount: number;
    gift_date: string;
    source: string;
    campaign: string;
  }[];
  communications: {
    id: number;
    kind: string;
    channel: string;
    date: string;
    status: string;
  }[];
  next_steps: {
    id: number;
    description: string;
    due_date: string;
    done: boolean;
  }[];
};

export const mockDonors: Donor[] = [
  {
    id: 1,
    first_name: "Maria",
    last_name: "Garcia",
    organization_name: null,
    email: "maria@example.com",
    phone: "(602) 555-0101",
    donor_type: "individual",
    owner: "Demo Board Member",
    total_donated: 250,
    last_thanked_at: "2026-10-15",
    active: true,
    gifts: [
      {
        id: 1,
        amount: 100,
        gift_date: "2026-03-12",
        source: "Zeffy",
        campaign: "Spring Giving",
      },
      {
        id: 2,
        amount: 150,
        gift_date: "2026-09-10",
        source: "Benevity",
        campaign: "Fall Giving",
      },
    ],
    communications: [
      {
        id: 1,
        kind: "Thank you",
        channel: "Email",
        date: "2026-10-15",
        status: "sent",
      },
    ],
    next_steps: [
      {
        id: 1,
        description: "Send quarterly program update",
        due_date: "2026-11-20",
        done: false,
      },
    ],
  },
  {
    id: 2,
    first_name: null,
    last_name: null,
    organization_name: "Example Foundation",
    email: "contact@example.org",
    phone: "(602) 555-0102",
    donor_type: "funder",
    owner: "Other Board Member",
    total_donated: 5000,
    last_thanked_at: "2026-09-01",
    active: true,
    gifts: [
      {
        id: 3,
        amount: 5000,
        gift_date: "2026-08-20",
        source: "Spreadsheet",
        campaign: "AI Academy",
      },
    ],
    communications: [],
    next_steps: [],
  },
  {
    id: 3,
    first_name: "James",
    last_name: "Wilson",
    organization_name: null,
    email: "james@example.com",
    phone: "(602) 555-0103",
    donor_type: "individual",
    owner: "Demo Board Member",
    total_donated: 150,
    last_thanked_at: null,
    active: true,
    gifts: [
      {
        id: 4,
        amount: 150,
        gift_date: "2026-07-05",
        source: "Zeffy",
        campaign: "Summer Camp",
      },
    ],
    communications: [],
    next_steps: [
      {
        id: 2,
        description: "Send first thank-you message",
        due_date: "2026-11-16",
        done: false,
      },
    ],
  },
];

export function donorName(donor: Donor) {
  return (
    donor.organization_name ||
    [donor.first_name, donor.last_name]
      .filter(Boolean)
      .join(" ")
  );
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
