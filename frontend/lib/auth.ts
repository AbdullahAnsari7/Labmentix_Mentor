import { supabase } from "./supabase";

export async function signUpUser(data: {
  fullName: string;
  email: string;
  password: string;
  role: "mentor" | "student";
}) {
  const { fullName, email, password, role } = data;

  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
      },
    },
  });

  return result;
}

export async function signInUser(data: {
  email: string;
  password: string;
}) {
  const { email, password } = data;

  return supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function signOutUser() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  return supabase.auth.getUser();
}

export async function getCurrentSession() {
  return supabase.auth.getSession();
}