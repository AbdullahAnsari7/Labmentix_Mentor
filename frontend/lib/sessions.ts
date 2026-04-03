import { supabase } from "./supabase";

export type SessionInput = {
  title: string;
  description: string;
  meeting_link: string;
  session_date: string;
};

export async function createSession(data: SessionInput) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .insert([
      {
        mentor_id: user.id,
        title: data.title,
        description: data.description,
        meeting_link: data.meeting_link,
        session_date: data.session_date,
      },
    ])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return session;
}

export async function getSessions() {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("session_date", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function getMyCreatedSessions() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("mentor_id", user.id)
    .order("session_date", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
export async function deleteSession(sessionId: string) {
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId);

  if (error) throw error;
}

export async function updateSession(sessionId: string, updates: any) {
  const { data, error } = await supabase
    .from("sessions")
    .update(updates)
    .eq("id", sessionId)
    .select()
    .single();

  if (error) throw error;

  return data;
}