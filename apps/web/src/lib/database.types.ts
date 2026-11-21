export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      case_work: {
        Row: {
          assignee_id: string | null
          contact_name: string | null
          contact_opt_in: boolean
          contact_phone: string | null
          duplicate_of: string | null
          first_action_at: string | null
          incident_id: string | null
          model_version: string | null
          override_reason: string | null
          prediction: Json | null
          request_id: string
          restricted: boolean
          started_at: string | null
          team_id: string | null
          triaged_at: string | null
          triaged_by: string | null
          urgency: string | null
        }
        Insert: {
          assignee_id?: string | null
          contact_name?: string | null
          contact_opt_in?: boolean
          contact_phone?: string | null
          duplicate_of?: string | null
          first_action_at?: string | null
          incident_id?: string | null
          model_version?: string | null
          override_reason?: string | null
          prediction?: Json | null
          request_id: string
          restricted?: boolean
          started_at?: string | null
          team_id?: string | null
          triaged_at?: string | null
          triaged_by?: string | null
          urgency?: string | null
        }
        Update: {
          assignee_id?: string | null
          contact_name?: string | null
          contact_opt_in?: boolean
          contact_phone?: string | null
          duplicate_of?: string | null
          first_action_at?: string | null
          incident_id?: string | null
          model_version?: string | null
          override_reason?: string | null
          prediction?: Json | null
          request_id?: string
          restricted?: boolean
          started_at?: string | null
          team_id?: string | null
          triaged_at?: string | null
          triaged_by?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_work_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_work_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_work_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_work_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_work_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      civic_settings: {
        Row: {
          barangay: string
          city: string
          dpo_email: string
          dpo_name: string
          dpo_phone: string
          emergency: string
          hall_address: string
          hotline: string
          hotspot_days: number
          hotspot_eps: number
          hotspot_min: number
          hotspot_minimum: number
          hotspot_radius: number
          intake_hours: string
          lupon_enabled: boolean
          office_hours: string
          retention_enabled: boolean
          retention_months: number
          singleton: boolean
          target_high: number
          target_medium: number
          target_normal: number
        }
        Insert: {
          barangay: string
          city?: string
          dpo_email?: string
          dpo_name?: string
          dpo_phone?: string
          emergency?: string
          hall_address?: string
          hotline?: string
          hotspot_days?: number
          hotspot_eps?: number
          hotspot_min?: number
          hotspot_minimum?: number
          hotspot_radius?: number
          intake_hours?: string
          lupon_enabled?: boolean
          office_hours?: string
          retention_enabled?: boolean
          retention_months?: number
          singleton?: boolean
          target_high?: number
          target_medium?: number
          target_normal?: number
        }
        Update: {
          barangay?: string
          city?: string
          dpo_email?: string
          dpo_name?: string
          dpo_phone?: string
          emergency?: string
          hall_address?: string
          hotline?: string
          hotspot_days?: number
          hotspot_eps?: number
          hotspot_min?: number
          hotspot_minimum?: number
          hotspot_radius?: number
          intake_hours?: string
          lupon_enabled?: boolean
          office_hours?: string
          retention_enabled?: boolean
          retention_months?: number
          singleton?: boolean
          target_high?: number
          target_medium?: number
          target_normal?: number
        }
        Relationships: []
      }
      duty_roster: {
        Row: {
          local_date: string
          officer_id: string
          shift: string
        }
        Insert: {
          local_date: string
          officer_id: string
          shift: string
        }
        Update: {
          local_date?: string
          officer_id?: string
          shift?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_roster_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["user_id"]
          },
        ]
      }
      field_assignments: {
        Row: {
          accepted_at: string | null
          arrived_at: string | null
          assigned_at: string
          close_reason: string | null
          closed_at: string | null
          has_photo: boolean
          id: string
          instructions: string
          report: string | null
          request_id: string
          result: string | null
          sent_by: string
          status: string
          tanod_id: string
        }
        Insert: {
          accepted_at?: string | null
          arrived_at?: string | null
          assigned_at?: string
          close_reason?: string | null
          closed_at?: string | null
          has_photo?: boolean
          id?: string
          instructions?: string
          report?: string | null
          request_id: string
          result?: string | null
          sent_by: string
          status?: string
          tanod_id: string
        }
        Update: {
          accepted_at?: string | null
          arrived_at?: string | null
          assigned_at?: string
          close_reason?: string | null
          closed_at?: string | null
          has_photo?: boolean
          id?: string
          instructions?: string
          report?: string | null
          request_id?: string
          result?: string | null
          sent_by?: string
          status?: string
          tanod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_assignments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_assignments_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "field_assignments_tanod_id_fkey"
            columns: ["tanod_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["user_id"]
          },
        ]
      }
      incident_updates: {
        Row: {
          actor_id: string
          affected: number
          created_at: string
          id: string
          incident_id: string
          message: string
        }
        Insert: {
          actor_id: string
          affected?: number
          created_at?: string
          id?: string
          incident_id: string
          message: string
        }
        Update: {
          actor_id?: string
          affected?: number
          created_at?: string
          id?: string
          incident_id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_updates_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          category: string
          closed_at: string | null
          created_at: string
          created_by: string
          id: string
          lat: number
          lon: number
          outcome: string | null
          radius_m: number
          ref: string
          title: string
        }
        Insert: {
          category: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          lat: number
          lon: number
          outcome?: string | null
          radius_m: number
          ref: string
          title: string
        }
        Update: {
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          lat?: number
          lon?: number
          outcome?: string | null
          radius_m?: number
          ref?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["category"]
          },
        ]
      }
      internal_case_events: {
        Row: {
          actor_id: string
          actor_name: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          request_id: string
        }
        Insert: {
          actor_id: string
          actor_name: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          request_id: string
        }
        Update: {
          actor_id?: string
          actor_name?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_case_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      lupon_cases: {
        Row: {
          close_note: string | null
          closed_at: string | null
          complainant: string
          conciliation_start: string | null
          extended: boolean
          filed_at: string
          filed_by: string
          id: string
          nature: string
          number: string
          request_id: string
          respondent: string
          respondent_address: string
          settlement: string | null
          settlement_at: string | null
          stage: string
        }
        Insert: {
          close_note?: string | null
          closed_at?: string | null
          complainant: string
          conciliation_start?: string | null
          extended?: boolean
          filed_at?: string
          filed_by: string
          id?: string
          nature: string
          number: string
          request_id: string
          respondent: string
          respondent_address: string
          settlement?: string | null
          settlement_at?: string | null
          stage?: string
        }
        Update: {
          close_note?: string | null
          closed_at?: string | null
          complainant?: string
          conciliation_start?: string | null
          extended?: boolean
          filed_at?: string
          filed_by?: string
          id?: string
          nature?: string
          number?: string
          request_id?: string
          respondent?: string
          respondent_address?: string
          settlement?: string | null
          settlement_at?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "lupon_cases_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      lupon_hearings: {
        Row: {
          at: string
          case_id: string
          id: string
          kind: string
          notes: string | null
          recorded_at: string | null
          result: string | null
          summons_served: boolean
        }
        Insert: {
          at: string
          case_id: string
          id?: string
          kind: string
          notes?: string | null
          recorded_at?: string | null
          result?: string | null
          summons_served?: boolean
        }
        Update: {
          at?: string
          case_id?: string
          id?: string
          kind?: string
          notes?: string | null
          recorded_at?: string | null
          result?: string | null
          summons_served?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lupon_hearings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "lupon_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          active: boolean
          created_at: string
          name: string
          phone: string | null
          role: string
          team_id: string | null
          title: string
          user_id: string
          zone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          name: string
          phone?: string | null
          role: string
          team_id?: string | null
          title?: string
          user_id: string
          zone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          name?: string
          phone?: string | null
          role?: string
          team_id?: string | null
          title?: string
          user_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_offices: {
        Row: {
          contact: string
          id: string
          name: string
          scope: string
        }
        Insert: {
          contact: string
          id?: string
          name: string
          scope: string
        }
        Update: {
          contact?: string
          id?: string
          name?: string
          scope?: string
        }
        Relationships: []
      }
      resident_notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          read_at: string | null
          request_id: string
          resident_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          request_id: string
          resident_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          request_id?: string
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_notifications_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["user_id"]
          },
        ]
      }
      resident_profiles: {
        Row: {
          agreed_at: string
          email_updates: boolean
          lang: string
          notice_version: string
          purok: string
          sms_opted_in_at: string | null
          sms_updates: boolean
          user_id: string
        }
        Insert: {
          agreed_at?: string
          email_updates?: boolean
          lang: string
          notice_version: string
          purok: string
          sms_opted_in_at?: string | null
          sms_updates?: boolean
          user_id: string
        }
        Update: {
          agreed_at?: string
          email_updates?: boolean
          lang?: string
          notice_version?: string
          purok?: string
          sms_opted_in_at?: string | null
          sms_updates?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["user_id"]
          },
        ]
      }
      resident_request_events: {
        Row: {
          author: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          request_id: string
        }
        Insert: {
          author: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          request_id: string
        }
        Update: {
          author?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          anonymized_at: string | null
          category: string | null
          channel: string
          closed_at: string | null
          created_at: string
          danger_now: boolean
          description: string
          duplicate_of_ref: string | null
          follow_up: boolean
          has_photo: boolean
          id: string
          location: Json | null
          outcome: string | null
          outcome_object: string | null
          outcome_photo: boolean
          ref: string
          referral_office: string | null
          resident_category: string | null
          resident_id: string | null
          status: string
          submission_key: string | null
          team_name: string | null
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          category?: string | null
          channel: string
          closed_at?: string | null
          created_at?: string
          danger_now?: boolean
          description: string
          duplicate_of_ref?: string | null
          follow_up?: boolean
          has_photo?: boolean
          id?: string
          location?: Json | null
          outcome?: string | null
          outcome_object?: string | null
          outcome_photo?: boolean
          ref: string
          referral_office?: string | null
          resident_category?: string | null
          resident_id?: string | null
          status?: string
          submission_key?: string | null
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          category?: string | null
          channel?: string
          closed_at?: string | null
          created_at?: string
          danger_now?: boolean
          description?: string
          duplicate_of_ref?: string | null
          follow_up?: boolean
          has_photo?: boolean
          id?: string
          location?: Json | null
          outcome?: string | null
          outcome_object?: string | null
          outcome_photo?: boolean
          ref?: string
          referral_office?: string | null
          resident_category?: string | null
          resident_id?: string | null
          status?: string
          submission_key?: string | null
          team_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teams: {
        Row: {
          category: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          id: string
          name: string
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_sms_auth_hook: { Args: { p_id: string }; Returns: boolean }
      admin_retention_preview: {
        Args: never
        Returns: {
          eligible: number
          erasure_pending: number
          held: number
        }[]
      }
      case_reporter: {
        Args: { p_id: string }
        Returns: {
          id: string
          name: string
          purok: string
        }[]
      }
      change_case: {
        Args: { p_action: string; p_id: string; p_input?: Json }
        Returns: string
      }
      change_field_assignment: {
        Args: {
          p_action: string
          p_id: string
          p_message?: string
          p_photo?: boolean
          p_result?: string
        }
        Returns: undefined
      }
      change_incident: {
        Args: {
          p_action: string
          p_id: string
          p_message?: string
          p_request?: string
        }
        Returns: Json
      }
      change_lupon_case: {
        Args: { p_action: string; p_id: string; p_value?: Json }
        Returns: string
      }
      change_officer_duty: {
        Args: {
          p_date: string
          p_officer: string
          p_on: boolean
          p_shift: string
        }
        Returns: undefined
      }
      complete_resident_profile: {
        Args: {
          p_consented: boolean
          p_lang: string
          p_name: string
          p_purok: string
        }
        Returns: undefined
      }
      copy_duty_week: { Args: { p_monday: string }; Returns: number }
      delivery_log: {
        Args: never
        Returns: {
          at: string
          attempt: number
          channel: string
          id: string
          purpose: string
          state: string
        }[]
      }
      dispatch_tanod: {
        Args: { p_id: string; p_instructions?: string; p_officer: string }
        Returns: string
      }
      erasure_ready_for_auth: {
        Args: never
        Returns: {
          id: string
          subject: string
        }[]
      }
      file_lupon_case: {
        Args: {
          p_address: string
          p_complainant: string
          p_confirmed: boolean
          p_nature: string
          p_request: string
          p_respondent: string
        }
        Returns: {
          id: string
          number: string
        }[]
      }
      finish_delivery: {
        Args: {
          p_attempt: number
          p_id: string
          p_provider_id?: string
          p_result: string
        }
        Returns: undefined
      }
      finish_erasure: { Args: { p_id: string }; Returns: undefined }
      finish_evidence_gc: { Args: { p_objects: string[] }; Returns: undefined }
      lease_one_delivery: {
        Args: { p_channels: string[] }
        Returns: {
          attempt: number
          channel: string
          id: string
          kind: string
          lang: string
          purpose: string
          recipient: string
          ref: string
        }[]
      }
      lease_sms_auth_hook: {
        Args: { p_id: string; p_phone: string; p_user: string }
        Returns: string
      }
      my_field_cases: {
        Args: never
        Returns: {
          assignment: Json
          linked_case: Json
          sender: string
        }[]
      }
      pending_evidence_gc: {
        Args: never
        Returns: {
          object_name: string
        }[]
      }
      publish_case_resolution: {
        Args: {
          p_field?: string
          p_id: string
          p_message: string
          p_object?: string
        }
        Returns: undefined
      }
      queue_abandoned_evidence: { Args: never; Returns: undefined }
      read_my_notifications: { Args: { p_ids?: string[] }; Returns: undefined }
      record_my_access_export: { Args: never; Returns: undefined }
      register_officer: {
        Args: {
          p_actor: string
          p_name: string
          p_phone: string
          p_user: string
          p_zone: string
        }
        Returns: undefined
      }
      register_staff_invitation: {
        Args: {
          p_actor: string
          p_name: string
          p_role: string
          p_team: string
          p_user: string
        }
        Returns: undefined
      }
      report_delivery_count: {
        Args: { p_end: string; p_start: string }
        Returns: number
      }
      report_duty_totals: {
        Args: { p_end: string; p_start: string }
        Returns: { day_count: number; night_count: number }[]
      }
      report_months: {
        Args: never
        Returns: {
          month: string
        }[]
      }
      report_operations: {
        Args: { p_end: string; p_start: string }
        Returns: {
          field_cancelled: number
          field_done: number
          field_sent: number
          incident_closed: number
          incident_linked: number
          incident_started: number
          incident_updates: number
          lupon_cfa: number
          lupon_dismissed: number
          lupon_filed: number
          lupon_pending: number
          lupon_settled: number
          lupon_withdrawn: number
          median_arrival_ms: number
        }[]
      }
      request_account_erasure: { Args: { p_email: string }; Returns: undefined }
      save_case_prediction: {
        Args: { p_case: string; p_prediction: Json; p_version: string }
        Returns: undefined
      }
      set_officer_active: {
        Args: { p_active: boolean; p_officer: string }
        Returns: undefined
      }
      staff_admin_audit: {
        Args: never
        Returns: {
          action: string
          actor: string
          at: string
          id: string
        }[]
      }
      staff_admin_change: {
        Args: {
          p_active: boolean
          p_role?: string
          p_team?: string
          p_user: string
        }
        Returns: undefined
      }
      staff_admin_members: {
        Args: never
        Returns: {
          active: boolean
          email: string
          id: string
          invited: boolean
          name: string
          role: string
          team_id: string
        }[]
      }
      staff_admin_settings: {
        Args: { p_group: string; p_input: Json }
        Returns: undefined
      }
      stage_approved_erasure: { Args: never; Returns: boolean }
      stage_retention: { Args: { p_limit?: number }; Returns: number }
      start_incident: {
        Args: { p_requests: string[]; p_title: string }
        Returns: string
      }
      submit_assisted_request: {
        Args: {
          p_category: string
          p_channel: string
          p_danger: boolean
          p_description: string
          p_location: Json
          p_name: string
          p_note: string
          p_phone: string
          p_sms: boolean
        }
        Returns: {
          id: string
          ref: string
        }[]
      }
      submit_resident_report: {
        Args: {
          p_category: string
          p_danger: boolean
          p_description: string
          p_key: string
          p_location: Json
          p_photo: boolean
        }
        Returns: {
          id: string
          ref: string
          replayed: boolean
        }[]
      }
      tanod_on_duty_partners: {
        Args: never
        Returns: {
          id: string
          name: string
          phone: string
          shift: string
          zone: string
        }[]
      }
      update_hotspot_settings: {
        Args: { p_minimum: number; p_radius: number }
        Returns: undefined
      }
      update_my_request: {
        Args: { p_action: string; p_id: string; p_message?: string }
        Returns: undefined
      }
      update_resident_preferences: {
        Args: {
          p_email?: boolean
          p_phone?: string
          p_phone_changed?: boolean
          p_sms?: boolean
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

