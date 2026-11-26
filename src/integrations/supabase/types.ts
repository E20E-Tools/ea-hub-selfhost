export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      archy_work_policy: { Row:{id:boolean;policy:Json}; Insert:{id?:boolean;policy:Json}; Update:{id?:boolean;policy?:Json}; Relationships:[] }
      admin_activity: {
        Row: {
          action: string
          actor_email: string
          actor_id: string
          created_at: string
          id: string
          target: string
        }
        Insert: {
          action: string
          actor_email?: string
          actor_id: string
          created_at?: string
          id?: string
          target?: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string
          created_at?: string
          id?: string
          target?: string
        }
        Relationships: []
      }
      affiliates: {
        Row: {
          created_at: string
          description_ar: string
          description_en: string
          id: string
          image_url: string
          sort_order: number
          title_ar: string
          title_en: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description_ar?: string
          description_en?: string
          id: string
          image_url?: string
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
          url?: string
        }
        Update: {
          created_at?: string
          description_ar?: string
          description_en?: string
          id?: string
          image_url?: string
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      ai_assistant_settings: {
        Row: {
          registration_limit: number
          registration_wait_minutes: number
          api_key: string | null
          chat_engine: "local" | "remote" | null
          base_url: string
          id: boolean
          key_changed_at: string | null
          model: string
          speed: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          registration_limit?: number
          registration_wait_minutes?: number
          api_key?: string | null
          chat_engine?: "local" | "remote" | null
          base_url?: string
          id?: boolean
          key_changed_at?: string | null
          model?: string
          speed?: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          registration_limit?: number
          registration_wait_minutes?: number
          api_key?: string | null
          chat_engine?: "local" | "remote" | null
          base_url?: string
          id?: boolean
          key_changed_at?: string | null
          model?: string
          speed?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      application_telemetry: {
        Row: {
          code: string
          created_at: string
          duration_ms: number
          id: string
          operation: string
          outcome: string
        }
        Insert: {
          code?: string
          created_at?: string
          duration_ms: number
          id?: string
          operation: string
          outcome: string
        }
        Update: {
          code?: string
          created_at?: string
          duration_ms?: number
          id?: string
          operation?: string
          outcome?: string
        }
        Relationships: []
      }
      archy_tour_visits: {
        Row: {
          chat_opened_at: string | null
          completed_at: string | null
          id: string
          started_at: string
          support_request_id: string | null
          support_submitted_at: string | null
          transformation_opened_at: string | null
          visitor_email: string
          visitor_id: string | null
          visitor_key: string
          visitor_name: string
        }
        Insert: {
          chat_opened_at?: string | null
          completed_at?: string | null
          id?: string
          started_at?: string
          support_request_id?: string | null
          support_submitted_at?: string | null
          transformation_opened_at?: string | null
          visitor_email?: string
          visitor_id?: string | null
          visitor_key: string
          visitor_name?: string
        }
        Update: {
          chat_opened_at?: string | null
          completed_at?: string | null
          id?: string
          started_at?: string
          support_request_id?: string | null
          support_submitted_at?: string | null
          transformation_opened_at?: string | null
          visitor_email?: string
          visitor_id?: string | null
          visitor_key?: string
          visitor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "archy_tour_visits_support_request_id_fkey"
            columns: ["support_request_id"]
            isOneToOne: false
            referencedRelation: "suggestion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_registrations: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          question: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          question: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          question?: string
        }
        Relationships: []
      }
      assistant_replies: {
        Row: {
          created_at: string
          id: string
          language: string
          reply: string
          visitor_email: string
          visitor_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          reply: string
          visitor_email: string
          visitor_name?: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          reply?: string
          visitor_email?: string
          visitor_name?: string
        }
        Relationships: []
      }
      contact_settings: {
        Row: {
          auto_reply_enabled: boolean
          auto_reply_text: string
          id: boolean
          notify_enabled: boolean
          recipient_email: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          auto_reply_enabled?: boolean
          auto_reply_text?: string
          id?: boolean
          notify_enabled?: boolean
          recipient_email?: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          auto_reply_enabled?: boolean
          auto_reply_text?: string
          id?: boolean
          notify_enabled?: boolean
          recipient_email?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      faq_answers: {
        Row: {
          answer: string
          created_at: string
          enabled: boolean
          id: string
          question: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          answer: string
          created_at?: string
          enabled?: boolean
          id?: string
          question: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          answer?: string
          created_at?: string
          enabled?: boolean
          id?: string
          question?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      journey_aggregates: {
        Row: {
          count: number
          day: string
          event: string
          language: string
          rating_sum: number
        }
        Insert: {
          count?: number
          day?: string
          event: string
          language: string
          rating_sum?: number
        }
        Update: {
          count?: number
          day?: string
          event?: string
          language?: string
          rating_sum?: number
        }
        Relationships: []
      }
      journey_event_receipts: {
        Row: {
          created_at: string
          event_key: string
        }
        Insert: {
          created_at?: string
          event_key: string
        }
        Update: {
          created_at?: string
          event_key?: string
        }
        Relationships: []
      }
      archy_cases: {
Row: {expected:string;id: string; language: string; question: string}
Insert: {expected?:string;id?: string; language: string; question: string}
Update: {expected?:string;id?: string; language?: string; question?: string}
Relationships: []
}
      product_reviews: {
Row: {product_id: string; reviewed_on: string}
Insert: {product_id: string; reviewed_on: string}
Update: {product_id?: string; reviewed_on?: string}
Relationships: []
}
archy_probe: {
Row: {engine: string; source: string|null; model: string|null; succeeded: boolean; elapsed_ms: number; checked_at: string}
Insert: {engine: string; source: string|null; model: string|null; succeeded: boolean; elapsed_ms: number; checked_at: string}
Update: {engine?: string; source?: string|null; model?: string|null; succeeded?: boolean; elapsed_ms?: number; checked_at?: string}
Relationships: []
}
archy_setting_events: {
Row: {id: string; actor: string; changes: string; created_at: string}
Insert: {id: string; actor: string; changes: string; created_at: string}
Update: {id?: string; actor?: string; changes?: string; created_at?: string}
Relationships: []
}
      live_chat_messages: {
        Row: {
          reply_ms: number | null
reply_source: string | null
reply_model: string | null
reply_language: string | null
prompt_id: string | null
helpful: boolean | null
feedback_reason: string | null
          body: string
          chat_id: string
          created_at: string
          id: string
          sender: string
        }
        Insert: {
          reply_ms?: number | null
reply_source?: string | null
reply_model?: string | null
reply_language?: string | null
prompt_id?: string | null
helpful?: boolean | null
feedback_reason?: string | null
          body: string
          chat_id: string
          created_at?: string
          id?: string
          sender: string
        }
        Update: {
          reply_ms?: number | null
reply_source?: string | null
reply_model?: string | null
reply_language?: string | null
prompt_id?: string | null
helpful?: boolean | null
feedback_reason?: string | null
          body?: string
          chat_id?: string
          created_at?: string
          id?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "live_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_ratings: {
        Row: {
          chat_id: string
          comment: string
          created_at: string
          stars: number
          updated_at: string
          visitor_id: string
        }
        Insert: {
          chat_id: string
          comment?: string
          created_at?: string
          stars: number
          updated_at?: string
          visitor_id: string
        }
        Update: {
          chat_id?: string
          comment?: string
          created_at?: string
          stars?: number
          updated_at?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_ratings_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "live_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chats: {
        Row: {
          admin_email: string | null
          created_at: string
          id: string
          language: string
          last_message_at: string
          last_page: string
          requested_at: string | null
          start_page: string
          status: string
          visitor_email: string
          visitor_id: string
          visitor_name: string
        }
        Insert: {
          admin_email?: string | null
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string
          last_page?: string
          requested_at?: string | null
          start_page?: string
          status?: string
          visitor_email: string
          visitor_id: string
          visitor_name?: string
        }
        Update: {
          admin_email?: string | null
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string
          last_page?: string
          requested_at?: string | null
          start_page?: string
          status?: string
          visitor_email?: string
          visitor_id?: string
          visitor_name?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          beneficiary_details: Json
          category: string
          services_enabled: boolean
          coming_soon: boolean
          created_at: string
          description: string
          description_en: string
          features: string[]
          features_en: string[]
          github_url: string
          id: string
          image_alt: string
          image_alt_en: string
          image_url: string
          keywords: string
          label: string
          label_en: string
          name: string
          overview: string
          overview_en: string
          publication_date: string | null
          sort_order: number
          updated_at: string
          url: string
          version: string
          whats_new: string
          whats_new_en: string
        }
        Insert: {
          beneficiary_details?: Json
          category?: string
          services_enabled?: boolean
          coming_soon?: boolean
          created_at?: string
          description?: string
          description_en?: string
          features?: string[]
          features_en?: string[]
          github_url?: string
          id: string
          image_alt?: string
          image_alt_en?: string
          image_url?: string
          keywords?: string
          label?: string
          label_en?: string
          name: string
          overview?: string
          overview_en?: string
          publication_date?: string | null
          sort_order?: number
          updated_at?: string
          url?: string
          version?: string
          whats_new?: string
          whats_new_en?: string
        }
        Update: {
          beneficiary_details?: Json
          category?: string
          services_enabled?: boolean
          coming_soon?: boolean
          created_at?: string
          description?: string
          description_en?: string
          features?: string[]
          features_en?: string[]
          github_url?: string
          id?: string
          image_alt?: string
          image_alt_en?: string
          image_url?: string
          keywords?: string
          label?: string
          label_en?: string
          name?: string
          overview?: string
          overview_en?: string
          publication_date?: string | null
          sort_order?: number
          updated_at?: string
          url?: string
          version?: string
          whats_new?: string
          whats_new_en?: string
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          bucket: string
          created_at: string
          id: number
          subject: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          subject: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          subject?: string
        }
        Relationships: []
      }
      request_identities: {
        Row: {
          account_id: string | null
          created_at: string
          request_id: string
          visitor_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          request_id: string
          visitor_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          request_id?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_identities_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "suggestion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_replies: {
        Row: {
          author_kind: string
          needs_reply: boolean
          author_email: string
          body: string
          created_at: string
          id: string
          request_id: string
        }
        Insert: {
          author_kind?: string
          needs_reply?: boolean
          author_email?: string
          body: string
          created_at?: string
          id?: string
          request_id: string
        }
        Update: {
          author_kind?: string
          needs_reply?: boolean
          author_email?: string
          body?: string
          created_at?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_replies_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "suggestion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          data_type: string
          days: number
          manual_enabled: boolean
          revision: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data_type: string
          days: number
          manual_enabled?: boolean
          revision?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data_type?: string
          days?: number
          manual_enabled?: boolean
          revision?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      semantic_documents: {
        Row: {
          body: string
          content_hash: string
          embedding: number[]
          id: string
          kind: string
          language: string
          model: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          body: string
          content_hash: string
          embedding: number[]
          id: string
          kind: string
          language: string
          model: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          body?: string
          content_hash?: string
          embedding?: number[]
          id?: string
          kind?: string
          language?: string
          model?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      settings_versions: {
        Row: {
          actor_id: string | null
          actor_label: string
          created_at: string
          id: string
          new_value: Json
          previous_value: Json
          restored_from: string | null
          section: string
          source: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          id?: string
          new_value: Json
          previous_value: Json
          restored_from?: string | null
          section: string
          source: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          id?: string
          new_value?: Json
          previous_value?: Json
          restored_from?: string | null
          section?: string
          source?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          arabic_title: string
          archy_greeting: Json
          body_font: string
          categories: Json
          categories_en: Json
          colors: Json
          contact_info: Json
          description: string
          description_en: string
          design_theme: Json
          display_title: string
          display_title_en: string
          feature_flags: Json
          footer_links: Json
          footer_text: string
          footer_text_en: string
          heading_font: string
          id: boolean
          image_brightness: number
          image_contrast: number
          image_fit: string
          image_saturation: number
          image_sharpen: boolean
          logo_url: string
          mobile_nav_style: string
          motion_direction: string
          motion_enabled: boolean
          motion_speed: number
          nav_style: string
          navigation_items: Json | null
          tagline: string
          tagline_en: string
          terms_content: Json
          theme_customizations: Json
          updated_at: string
        }
        Insert: {
          arabic_title?: string
          archy_greeting?: Json
          body_font?: string
          categories?: Json
          categories_en?: Json
          colors?: Json
          contact_info?: Json
          description?: string
          description_en?: string
          design_theme?: Json
          display_title?: string
          display_title_en?: string
          feature_flags?: Json
          footer_links?: Json
          footer_text?: string
          footer_text_en?: string
          heading_font?: string
          id?: boolean
          image_brightness?: number
          image_contrast?: number
          image_fit?: string
          image_saturation?: number
          image_sharpen?: boolean
          logo_url?: string
          mobile_nav_style?: string
          motion_direction?: string
          motion_enabled?: boolean
          motion_speed?: number
          nav_style?: string
          navigation_items?: Json | null
          tagline?: string
          tagline_en?: string
          terms_content?: Json
          theme_customizations?: Json
          updated_at?: string
        }
        Update: {
          arabic_title?: string
          archy_greeting?: Json
          body_font?: string
          categories?: Json
          categories_en?: Json
          colors?: Json
          contact_info?: Json
          description?: string
          description_en?: string
          design_theme?: Json
          display_title?: string
          display_title_en?: string
          feature_flags?: Json
          footer_links?: Json
          footer_text?: string
          footer_text_en?: string
          heading_font?: string
          id?: boolean
          image_brightness?: number
          image_contrast?: number
          image_fit?: string
          image_saturation?: number
          image_sharpen?: boolean
          logo_url?: string
          mobile_nav_style?: string
          motion_direction?: string
          motion_enabled?: boolean
          motion_speed?: number
          nav_style?: string
          navigation_items?: Json | null
          tagline?: string
          tagline_en?: string
          terms_content?: Json
          theme_customizations?: Json
          updated_at?: string
        }
        Relationships: []
      }
      site_visits: {
        Row: {
          day: string
          first_seen_at: string
          visitor_key: string
        }
        Insert: {
          day: string
          first_seen_at?: string
          visitor_key: string
        }
        Update: {
          day?: string
          first_seen_at?: string
          visitor_key?: string
        }
        Relationships: []
      }
      suggestion_requests: {
        Row: {
          attachments: Json
          company: string | null
          created_at: string
          details: Json
          email: string
          id: string
          impact: string
          name: string
          pending_question: string
          need: string
          phone: string
          product_id: string | null
          recommendation: Json | null
          request_type: string
          status: string
          status_updated_at: string | null
          urgency: string | null
        }
        Insert: {
          attachments?: Json
          company?: string | null
          created_at?: string
          details?: Json
          email: string
          id?: string
          impact?: string
          name: string
          need: string
          phone?: string
          product_id?: string | null
          recommendation?: Json | null
          request_type?: string
          status?: string
          status_updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          attachments?: Json
          company?: string | null
          created_at?: string
          details?: Json
          email?: string
          id?: string
          impact?: string
          name?: string
          need?: string
          phone?: string
          product_id?: string | null
          recommendation?: Json | null
          request_type?: string
          status?: string
          status_updated_at?: string | null
          urgency?: string | null
        }
        Relationships: []
      }
      support_offers: {
        Row: {
          created_at: string
          details: Json
          email: string
          id: string
          message: string
          name: string
          offer_type: string
          organization: string
          phone: string
          status: string
          status_updated_at: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          email: string
          id?: string
          message?: string
          name: string
          offer_type: string
          organization?: string
          phone?: string
          status?: string
          status_updated_at?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          email?: string
          id?: string
          message?: string
          name?: string
          offer_type?: string
          organization?: string
          phone?: string
          status?: string
          status_updated_at?: string | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          created_at: string
          id: string
          image_url: string
          name: string
          organization_ar: string
          organization_en: string
          published: boolean
          quote_ar: string
          quote_en: string
          role_ar: string
          role_en: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string
          name: string
          organization_ar?: string
          organization_en?: string
          published?: boolean
          quote_ar?: string
          quote_en?: string
          role_ar?: string
          role_en?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          name?: string
          organization_ar?: string
          organization_en?: string
          published?: boolean
          quote_ar?: string
          quote_en?: string
          role_ar?: string
          role_en?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      archy_feedback_totals: { Row: {reply_source:string;reply_model:string|null;reply_language:string;positive:number;negative:number};Relationships:[] }
    }
    Functions: {
      cleanup_retention_batch: {
        Args: {
          _actor: string
          _expected_revision: number
          _ids: string[]
          _type: string
        }
        Returns: number
      }
      register_archy_guest: {
        Args: { _subject: string; _name: string; _email: string; _question: string }
        Returns: number
      }
      consume_rate_limit: {
        Args: {
          _bucket: string
          _limit: number
          _subject: string
          _window_seconds: number
        }
        Returns: boolean
      }
      has_admin_owner: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_expired_chats_bounded: { Args: never; Returns: number }
      record_journey_event: {
        Args: {
          _event: string
          _event_key: string
          _language: string
          _rating?: number
        }
        Returns: boolean
      }
      restore_settings_version: {
        Args: {
          _actor: string
          _expected: Json
          _value: Json
          _version: string
        }
        Returns: string
      }
      retention_candidates: {
        Args: { _days: number; _limit: number; _type: string }
        Returns: {
          candidate_id: string
          eligible_at: string
        }[]
      }
      run_daily_maintenance: { Args: { _batch?: number }; Returns: Json }
      settings_safe_value: { Args: { v: Json }; Returns: Json }
      settings_section_value: {
        Args: { row_value: Json; section_name: string; source_name: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const
